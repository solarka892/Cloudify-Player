//! Folding text so it can be found by someone typing loosely.
//!
//! The problem this solves is not "search". It is that a library assembled on
//! SoundCloud is written in at least two scripts, and the person searching it is
//! at a keyboard that is currently in one of them. Looking for «Вязки» with a
//! US layout means typing `vyazki`, and looking for `Sunset Grid` with a Russian
//! layout is no better. A search that only matches the script the title happens
//! to be written in fails at exactly the moment it is needed.
//!
//! ## One function, both directions
//!
//! There is only one transformation here, Cyrillic → Latin, and it runs over
//! *both* the indexed text and the query. That is what makes it work in both
//! directions, and it is worth spelling out because it looks like it should not:
//!
//!   - query `vyazki`, title «Вязки» → the title's folded form is `vyazki`;
//!   - query «Вязки», title `Vyazki` → the *query's* folded form is `vyazki`,
//!     and the title, being Latin already, folds to itself.
//!
//! Both sides pass through the same function, so all four combinations of script
//! meet in the middle. Nothing anywhere transliterates Latin back into Cyrillic,
//! which would be guesswork.
//!
//! ## Why it is deliberately lossy
//!
//! The scheme below is not any of the published romanisation standards, and it
//! is not trying to be: nobody typing a search box types ISO 9. It is built to
//! collapse the ways the same word is actually typed. `Чёрный воздух` is typed
//! `chernyy vozduh`, `chyornyy vozdukh`, `cherny vozduh`; all three fold to the
//! same string. Because both sides are folded, every collapsing rule is safe by
//! construction — it can only ever widen what matches, never split it.
//!
//! The output is lowercase, `[a-z0-9 ]` only, with runs of anything else
//! collapsed to a single space. That last part earns its keep on SoundCloud in
//! particular, where `(prod. by …)`, `[Free DL]` and `★` are half the title.

/// One Cyrillic letter's Latin form. Lowercase only; the caller folds case first.
fn latin(c: char) -> Option<&'static str> {
    Some(match c {
        'а' => "a",
        'б' => "b",
        'в' => "v",
        'г' => "g",
        // Ukrainian ge. Distinct letter, same sound for our purposes.
        'ґ' => "g",
        'д' => "d",
        'е' => "e",
        // `e`, not `yo`: it is typed as `e` far more often than not, and the
        // digraph rule below folds `yo` onto `e` anyway for the people who do.
        'ё' => "e",
        'є' => "ye",
        'ж' => "zh",
        'з' => "z",
        'и' => "i",
        'і' => "i",
        'ї' => "yi",
        'й' => "y",
        'к' => "k",
        'л' => "l",
        'м' => "m",
        'н' => "n",
        'о' => "o",
        'п' => "p",
        'р' => "r",
        'с' => "s",
        'т' => "t",
        'у' => "u",
        'ф' => "f",
        // `h`, not `kh`. Same reasoning as `ё`, and `kh` folds onto `h` below.
        'х' => "h",
        'ц' => "c",
        'ч' => "ch",
        'ш' => "sh",
        'щ' => "sch",
        // The signs carry no sound and are never typed by someone searching.
        'ъ' | 'ь' => "",
        'ы' => "y",
        'э' => "e",
        'ю' => "yu",
        'я' => "ya",
        _ => return None,
    })
}

/// Digraphs that are really one sound spelled two ways, longest first.
///
/// Applied to the *whole* string after transliteration, so they catch both the
/// output of the table above and Latin text that was never Cyrillic — which is
/// the point: `Tsunami` and «Цунами» both come out `cunami`.
const COLLAPSE: &[(&str, &str)] = &[
    ("shch", "sch"),
    ("kh", "h"),
    ("yo", "e"),
    ("jo", "e"),
    ("ts", "c"),
    ("iy", "y"),
    ("yy", "y"),
    ("ij", "y"),
    ("j", "y"),
    ("w", "v"),
];

/// Fold `text` into the form both the index and the query are compared in.
pub fn fold(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars().flat_map(char::to_lowercase) {
        match latin(c) {
            Some(latin) => out.push_str(latin),
            None => out.push(c),
        }
    }

    for (from, to) in COLLAPSE {
        if out.contains(from) {
            out = out.replace(from, to);
        }
    }

    // Everything that is not a letter or a digit becomes a separator. Done last,
    // so the digraph rules above see whole words rather than fragments.
    let mut folded = String::with_capacity(out.len());
    let mut pending_space = false;
    for c in out.chars() {
        if c.is_ascii_alphanumeric() {
            if pending_space && !folded.is_empty() {
                folded.push(' ');
            }
            pending_space = false;
            folded.push(c);
        } else {
            pending_space = true;
        }
    }
    folded
}

#[cfg(test)]
mod tests {
    use super::fold;

    /// The table this is judged by. Every row is a real way someone types.
    #[test]
    fn folds_both_scripts_onto_the_same_string() {
        let pairs = [
            ("Вязки", "vyazki"),
            ("вязки", "VYAZKI"),
            ("Чёрный воздух", "chernyy vozduh"),
            ("Чёрный воздух", "chyornyy vozdukh"),
            ("Черный Воздух", "cherny vozduh"),
            ("Цунами", "tsunami"),
            ("Цунами", "Cunami"),
            ("Щука", "schuka"),
            ("Щука", "shchuka"),
            ("Дождь", "dozhd"),
            ("Київ", "kyiv"),
            ("Сонце", "sonce"),
        ];
        for (cyrillic, latin) in pairs {
            assert_eq!(
                fold(cyrillic),
                fold(latin),
                "{cyrillic:?} and {latin:?} should fold together",
            );
        }
    }

    #[test]
    fn is_idempotent() {
        // Both sides of a comparison are folded, and the indexed side is folded
        // once when it is written and never again — so a second pass changing
        // the answer would mean the index and the query disagree.
        for s in ["Чёрный воздух", "Tsunami [Free DL]", "щука", "Vyazki"] {
            assert_eq!(fold(&fold(s)), fold(s), "{s:?}");
        }
    }

    #[test]
    fn strips_the_decoration_soundcloud_titles_come_with() {
        assert_eq!(
            fold("Sunset  Grid (prod. by Someone) [Free DL] ★"),
            "sunset grid prod by someone free dl",
        );
        // No leading or trailing separator, whatever the input started with.
        assert_eq!(fold("  ...Вязки!!!  "), "vyazki");
    }

    #[test]
    fn keeps_latin_text_readable() {
        // A Latin title is not mangled beyond the collapsing rules — this is a
        // search key, but it is also what the duplicate finder compares.
        assert_eq!(fold("Sunset Grid"), "sunset grid");
        assert_eq!(fold("Number 9"), "number 9");
    }
}
