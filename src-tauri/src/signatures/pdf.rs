use super::algorithms::Digest;
use super::types::{ByteRange, CONTENTS_HEX_LENGTH, SignaturePlaceholder};
use super::util::{hex_decode, hex_upper, read_tlv};

fn preceded_by(pdf: &[u8], at: usize, key: &[u8]) -> bool {
    let before = pdf[..at].trim_ascii_end();
    before.ends_with(key)
}

pub fn validate_placeholder(pdf: &[u8], placeholder: &SignaturePlaceholder) -> Result<(), String> {
    let SignaturePlaceholder { byte_range_at, byte_range_length, contents_at, contents_length } = *placeholder;
    let bad = |what: &str| Err(format!("The document's signature placeholder is not valid ({what})"));
    if !pdf.starts_with(b"%PDF-") {
        return bad("not a PDF");
    }
    let contents_end = contents_at.checked_add(contents_length).filter(|&end| end <= pdf.len());
    let range_end = byte_range_at.checked_add(byte_range_length).filter(|&end| end <= pdf.len());
    let (Some(contents_end), Some(range_end)) = (contents_end, range_end) else {
        return bad("outside the file");
    };
    if contents_length != CONTENTS_HEX_LENGTH + 2 {
        return bad("wrong /Contents size");
    }
    let contents = &pdf[contents_at..contents_end];
    if contents[0] != b'<' || contents[contents_length - 1] != b'>' || contents[1..contents_length - 1].iter().any(|&byte| byte != b'0') {
        return bad("/Contents isn't empty");
    }
    if byte_range_length < 12 {
        return bad("/ByteRange too short");
    }
    let range = &pdf[byte_range_at..range_end];
    if range[0] != b'[' || range[byte_range_length - 1] != b']' || range[1..byte_range_length - 1].iter().any(|&byte| !(byte == b' ' || byte.is_ascii_digit())) {
        return bad("/ByteRange isn't a placeholder");
    }
    if byte_range_at < contents_end && contents_at < range_end {
        return bad("overlapping placeholders");
    }
    if !preceded_by(pdf, contents_at, b"/Contents") || !preceded_by(pdf, byte_range_at, b"/ByteRange") {
        return bad("not in a signature dictionary");
    }
    Ok(())
}

pub fn fill_byte_range(pdf: &mut [u8], placeholder: &SignaturePlaceholder) -> Result<ByteRange, String> {
    validate_placeholder(pdf, placeholder)?;
    let gap_end = placeholder.contents_at + placeholder.contents_length;
    let range = [0, placeholder.contents_at as u64, gap_end as u64, (pdf.len() - gap_end) as u64];
    let mut text = format!("[0 {} {} {}", range[1], range[2], range[3]).into_bytes();
    if text.len() + 1 > placeholder.byte_range_length {
        return Err("The document's /ByteRange placeholder is too short".into());
    }
    text.resize(placeholder.byte_range_length - 1, b' ');
    text.push(b']');
    pdf[placeholder.byte_range_at..placeholder.byte_range_at + placeholder.byte_range_length].copy_from_slice(&text);
    Ok(range)
}

pub fn covered<'a>(pdf: &'a [u8], range: &ByteRange) -> Result<[&'a [u8]; 2], String> {
    let to_usize = |value: u64| usize::try_from(value).map_err(|_| "The signature's byte range is too large".to_string());
    let [start, first, second, length] = [to_usize(range[0])?, to_usize(range[1])?, to_usize(range[2])?, to_usize(range[3])?];
    let end = second.checked_add(length).ok_or("The signature's byte range overflows")?;
    if start != 0 || first == 0 || first > second || end > pdf.len() {
        return Err("The signature's byte range doesn't fit the file".into());
    }
    Ok([&pdf[..first], &pdf[second..end]])
}

pub fn digest_range(pdf: &[u8], range: &ByteRange, digest: Digest) -> Result<Vec<u8>, String> {
    Ok(digest.hash(&covered(pdf, range)?))
}

pub fn signature_contents(pdf: &[u8], range: &ByteRange) -> Result<Vec<u8>, String> {
    covered(pdf, range)?;
    let gap = &pdf[range[1] as usize..range[2] as usize];
    let hex = gap.strip_prefix(b"<").and_then(|rest| rest.strip_suffix(b">")).ok_or("The signature's /Contents isn't a hex string")?;
    let bytes = hex_decode(hex).ok_or("The signature's /Contents isn't valid hex")?;
    let length = read_tlv(&bytes).map(|(tlv, _)| tlv.raw.len()).ok_or("The signature's /Contents is empty or not DER")?;
    Ok(bytes[..length].to_vec())
}

pub fn embed_contents(pdf: &mut [u8], placeholder: &SignaturePlaceholder, der: &[u8]) -> Result<(), String> {
    let hex = hex_upper(der);
    if hex.len() > placeholder.contents_length - 2 {
        return Err(format!("The signature ({} bytes) doesn't fit in the space reserved in the document", der.len()));
    }
    let start = placeholder.contents_at + 1;
    pdf[start..start + hex.len()].copy_from_slice(hex.as_bytes());
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn append_placeholder(pdf: &mut Vec<u8>) -> SignaturePlaceholder {
        pdf.extend_from_slice(b"1 0 obj\n<< /Type /Sig /ByteRange ");
        let byte_range_at = pdf.len();
        pdf.extend_from_slice(b"[0 0000000000 0000000000 0000000000]");
        let byte_range_length = pdf.len() - byte_range_at;
        pdf.extend_from_slice(b" /Contents ");
        let contents_at = pdf.len();
        pdf.push(b'<');
        pdf.extend(std::iter::repeat_n(b'0', CONTENTS_HEX_LENGTH));
        pdf.push(b'>');
        pdf.extend_from_slice(b" >>\nendobj\n%%EOF\n");
        SignaturePlaceholder { byte_range_at, byte_range_length, contents_at, contents_length: CONTENTS_HEX_LENGTH + 2 }
    }

    pub fn prepared_pdf() -> (Vec<u8>, SignaturePlaceholder) {
        let mut pdf = b"%PDF-1.7\n".to_vec();
        let placeholder = append_placeholder(&mut pdf);
        (pdf, placeholder)
    }

    #[test]
    fn fills_the_byte_range_to_the_same_width() {
        let (mut pdf, placeholder) = prepared_pdf();
        let length = pdf.len();
        let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
        assert_eq!(pdf.len(), length);
        assert_eq!(range[0], 0);
        assert_eq!(range[1], placeholder.contents_at as u64);
        assert_eq!(range[2] + range[3], length as u64);
        let text = std::str::from_utf8(&pdf[placeholder.byte_range_at..placeholder.byte_range_at + placeholder.byte_range_length]).unwrap();
        assert!(text.starts_with(&format!("[0 {} {} {}", range[1], range[2], range[3])));
        assert!(text.ends_with(" ]"));
        let parts = covered(&pdf, &range).unwrap();
        assert_eq!(parts[0].len() + parts[1].len() + placeholder.contents_length, length);
    }

    #[test]
    fn refuses_bad_placeholders() {
        let (pdf, placeholder) = prepared_pdf();
        let shifted = SignaturePlaceholder { contents_at: placeholder.contents_at + 1, ..placeholder };
        assert!(validate_placeholder(&pdf, &shifted).is_err());
        let short = SignaturePlaceholder { contents_length: 10, ..placeholder };
        assert!(validate_placeholder(&pdf, &short).is_err());
        let past_end = SignaturePlaceholder { byte_range_at: pdf.len() - 2, ..placeholder };
        assert!(validate_placeholder(&pdf, &past_end).is_err());
        let mut dirty = pdf.clone();
        dirty[placeholder.contents_at + 5] = b'1';
        assert!(validate_placeholder(&dirty, &placeholder).is_err());
        let mut renamed = pdf.clone();
        renamed[placeholder.contents_at - 3] = b'X';
        assert!(validate_placeholder(&renamed, &placeholder).is_err());
        let mut not_pdf = pdf.clone();
        not_pdf[0] = b'X';
        assert!(validate_placeholder(&not_pdf, &placeholder).is_err());
        let mut letters = pdf;
        letters[placeholder.byte_range_at + 3] = b'*';
        assert!(validate_placeholder(&letters, &placeholder).is_err());
    }

    #[test]
    fn embeds_and_reads_back_contents() {
        let (mut pdf, placeholder) = prepared_pdf();
        let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
        let der = [0x30, 0x03, 0x02, 0x01, 0x05];
        embed_contents(&mut pdf, &placeholder, &der).unwrap();
        assert_eq!(signature_contents(&pdf, &range).unwrap(), der);
        let too_big = vec![0u8; CONTENTS_HEX_LENGTH / 2 + 1];
        assert!(embed_contents(&mut pdf, &placeholder, &too_big).is_err());
    }

    #[test]
    fn rejects_byte_ranges_that_dont_fit() {
        let pdf = vec![b'x'; 100];
        assert!(covered(&pdf, &[0, 10, 20, 80]).is_ok());
        assert!(covered(&pdf, &[1, 10, 20, 10]).is_err());
        assert!(covered(&pdf, &[0, 30, 20, 10]).is_err());
        assert!(covered(&pdf, &[0, 10, 20, 81]).is_err());
        assert!(covered(&pdf, &[0, 10, u64::MAX, 1]).is_err());
    }
}
