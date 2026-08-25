//! Ids handed in by the frontend that end up inside upstream URLs, sidecar
//! arguments and file names — YouTube video and browse ids, Navidrome song
//! ids. One character class for all of them, so none can smuggle a path
//! separator, a query delimiter or a shell-relevant character.

/// Non-empty, ASCII alphanumerics plus `-` and `_` only.
pub(crate) fn is_plain_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::is_plain_id;

    #[test]
    fn accepts_the_id_shapes_every_source_uses() {
        assert!(is_plain_id("dQw4w9WgXcQ"));
        assert!(is_plain_id("MPREb_1Ab-cD"));
        assert!(is_plain_id("UCTLkOu1J8aNJhEiWFWbMnVQ"));
        assert!(is_plain_id("3f2a9c1e"));
    }

    #[test]
    fn rejects_empty_whitespace_and_delimiters() {
        assert!(!is_plain_id(""));
        assert!(!is_plain_id(" dQw4w9WgXcQ"));
        assert!(!is_plain_id("a/b"));
        assert!(!is_plain_id("a?x=1"));
        assert!(!is_plain_id("../x"));
        assert!(!is_plain_id("ид"));
    }
}
