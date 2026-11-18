use std::borrow::Cow;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn hex_upper(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02X}")).collect()
}

pub fn hex_decode(text: &[u8]) -> Option<Vec<u8>> {
    let digits: Vec<u8> = text.iter().copied().filter(|byte| !byte.is_ascii_whitespace()).collect();
    let nibble = |byte: u8| (byte as char).to_digit(16).map(|digit| digit as u8);
    let mut bytes = Vec::with_capacity(digits.len().div_ceil(2));
    for pair in digits.chunks(2) {
        let high = nibble(pair[0])?;
        let low = pair.get(1).map_or(Some(0), |&byte| nibble(byte))?;
        bytes.push(high << 4 | low);
    }
    Some(bytes)
}

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_secs() as i64)
}

pub fn iso_time(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let rest = seconds.rem_euclid(86_400);
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era = (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rest / 3600, rest % 3600 / 60, rest % 60)
}

#[derive(Clone, Copy)]
pub struct Tlv<'a> {
    pub tag: u8,
    pub value: &'a [u8],
    pub raw: &'a [u8],
}

pub fn read_tlv(input: &[u8]) -> Option<(Tlv<'_>, &[u8])> {
    let (&tag, rest) = input.split_first()?;
    if tag & 0x1f == 0x1f {
        return None;
    }
    let (&first, rest) = rest.split_first()?;
    let (length, rest) = if first < 0x80 {
        (first as usize, rest)
    } else {
        let count = (first & 0x7f) as usize;
        if count == 0 || count > 4 || rest.len() < count {
            return None;
        }
        let length = rest[..count].iter().fold(0usize, |length, &byte| length << 8 | byte as usize);
        (length, &rest[count..])
    };
    if rest.len() < length {
        return None;
    }
    let header = input.len() - rest.len();
    Some((Tlv { tag, value: &rest[..length], raw: &input[..header + length] }, &rest[length..]))
}

pub fn children(value: &[u8]) -> Option<Vec<Tlv<'_>>> {
    let mut rest = value;
    let mut items = Vec::new();
    while !rest.is_empty() {
        let (item, next) = read_tlv(rest)?;
        items.push(item);
        rest = next;
    }
    Some(items)
}

const MAX_BER_DEPTH: usize = 64;
const OCTET_STRING: u8 = 0x04;
const CONSTRUCTED: u8 = 0x20;

fn encode_tlv(tag: u8, value: &[u8]) -> Vec<u8> {
    let length = value.len().to_be_bytes();
    let significant = &length[length.iter().position(|&byte| byte != 0).unwrap_or(length.len())..];
    let mut out = Vec::with_capacity(value.len() + 2 + significant.len());
    out.push(tag);
    if value.len() < 0x80 {
        out.push(value.len() as u8);
    } else {
        out.push(0x80 | significant.len() as u8);
        out.extend_from_slice(significant);
    }
    out.extend_from_slice(value);
    out
}

fn joined_octets(parts: &[u8]) -> Option<Vec<u8>> {
    let mut joined = Vec::new();
    for part in children(parts)? {
        if part.tag != OCTET_STRING {
            return None;
        }
        joined.extend_from_slice(part.value);
    }
    Some(joined)
}

fn header_len(length: usize) -> usize {
    if length < 0x80 { 2 } else { 2 + (usize::BITS - length.leading_zeros()).div_ceil(8) as usize }
}

fn normalize(input: &[u8], depth: usize) -> Option<(Cow<'_, [u8]>, usize)> {
    if depth > MAX_BER_DEPTH {
        return None;
    }
    let (&tag, rest) = input.split_first()?;
    if tag & 0x1f == 0x1f {
        return None;
    }
    let constructed = tag & CONSTRUCTED != 0;
    let (mut body, definite_len, mut changed) = match rest.first() {
        Some(0x80) if constructed => (&rest[1..], None, true),
        Some(0x80) => return None,
        _ => {
            let (tlv, _) = read_tlv(input)?;
            let padded = tlv.raw.len() - tlv.value.len() != header_len(tlv.value.len());
            if !constructed {
                return Some((if padded { Cow::Owned(encode_tlv(tag, tlv.value)) } else { Cow::Borrowed(tlv.raw) }, tlv.raw.len()));
            }
            (tlv.value, Some(tlv.raw.len()), padded)
        }
    };
    let start = body;
    let mut contents: Option<Vec<u8>> = None;
    loop {
        if definite_len.is_none() && body.starts_with(&[0, 0]) {
            body = &body[2..];
            break;
        }
        if definite_len.is_some() && body.is_empty() {
            break;
        }
        let (child, used) = normalize(body, depth + 1)?;
        if let Cow::Owned(owned) = &child {
            let done = start.len() - body.len();
            contents.get_or_insert_with(|| start[..done].to_vec()).extend_from_slice(owned);
        } else if let Some(contents) = &mut contents {
            contents.extend_from_slice(&child);
        }
        body = &body[used..];
    }
    let used = definite_len.unwrap_or(input.len() - body.len());
    let value_end = if definite_len.is_some() { start.len() } else { start.len() - body.len() - 2 };
    changed |= contents.is_some();
    let contents = contents.map_or(Cow::Borrowed(&start[..value_end]), Cow::Owned);
    if tag == OCTET_STRING | CONSTRUCTED {
        return Some((Cow::Owned(encode_tlv(OCTET_STRING, &joined_octets(&contents)?)), used));
    }
    if !changed {
        return Some((Cow::Borrowed(&input[..used]), used));
    }
    Some((Cow::Owned(encode_tlv(tag, &contents)), used))
}

pub fn ber_element_len(input: &[u8]) -> Option<usize> {
    normalize(input, 0).map(|(_, used)| used)
}

pub fn ber_to_der(input: &[u8]) -> Option<Cow<'_, [u8]>> {
    let (element, used) = normalize(input, 0)?;
    (used == input.len()).then_some(element)
}

pub fn first_child(der: &[u8]) -> Option<Tlv<'_>> {
    let (outer, _) = read_tlv(der)?;
    read_tlv(outer.value).map(|(child, _)| child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_unix_times_as_iso_dates() {
        assert_eq!(iso_time(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_time(1_762_819_200), "2025-11-11T00:00:00Z");
        assert_eq!(iso_time(951_782_400 + 3661), "2000-02-29T01:01:01Z");
    }

    #[test]
    fn decodes_hex_with_whitespace_and_an_odd_digit() {
        assert_eq!(hex_decode(b"0a FF\n1"), Some(vec![0x0a, 0xff, 0x10]));
        assert_eq!(hex_decode(b"zz"), None);
        assert_eq!(hex_upper(&[0x0a, 0xff]), "0AFF");
    }

    #[test]
    fn walks_der_elements() {
        let der = [0x30, 0x06, 0x02, 0x01, 0x01, 0x04, 0x01, 0xaa, 0x00, 0x00];
        let (outer, rest) = read_tlv(&der).unwrap();
        assert_eq!(outer.raw.len(), 8);
        assert_eq!(rest, &[0, 0]);
        let items = children(outer.value).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].value, &[0xaa]);
        assert!(read_tlv(&[0x30, 0x05, 0x00]).is_none());
    }

    #[test]
    fn rewrites_indefinite_lengths_as_definite() {
        let ber = [0x30, 0x80, 0xa0, 0x80, 0x02, 0x01, 0x05, 0x00, 0x00, 0x04, 0x01, 0xaa, 0x00, 0x00, 0x00, 0x00];
        assert_eq!(ber_element_len(&ber), Some(14));
        assert!(ber_to_der(&ber).is_none());
        assert_eq!(ber_to_der(&ber[..14]).unwrap().as_ref(), &[0x30, 0x08, 0xa0, 0x03, 0x02, 0x01, 0x05, 0x04, 0x01, 0xaa]);
    }

    #[test]
    fn keeps_definite_elements_byte_for_byte() {
        let der = [0x30, 0x06, 0x02, 0x01, 0x01, 0x04, 0x01, 0xaa];
        assert!(matches!(ber_to_der(&der), Some(Cow::Borrowed(_))));
        let mixed = [0x30, 0x80, 0x31, 0x03, 0x02, 0x01, 0x07, 0x00, 0x00];
        assert_eq!(ber_to_der(&mixed).unwrap().as_ref(), &[0x30, 0x05, 0x31, 0x03, 0x02, 0x01, 0x07]);
        let nested = [0x30, 0x06, 0x30, 0x80, 0x05, 0x00, 0x00, 0x00];
        assert_eq!(ber_to_der(&nested).unwrap().as_ref(), &[0x30, 0x04, 0x30, 0x02, 0x05, 0x00]);
    }

    #[test]
    fn shortens_padded_lengths() {
        let padded = [0x30, 0x82, 0x00, 0x06, 0x31, 0x04, 0x02, 0x81, 0x01, 0x07];
        assert_eq!(ber_to_der(&padded).unwrap().as_ref(), &[0x30, 0x05, 0x31, 0x03, 0x02, 0x01, 0x07]);
        let long: Vec<u8> = [&[0x04, 0x81, 0x80][..], &[0xee; 128]].concat();
        assert!(matches!(ber_to_der(&long), Some(Cow::Borrowed(_))));
    }

    #[test]
    fn joins_constructed_octet_strings() {
        let ber = [0x24, 0x80, 0x04, 0x02, 0x01, 0x02, 0x04, 0x01, 0x03, 0x00, 0x00];
        assert_eq!(ber_to_der(&ber).unwrap().as_ref(), &[0x04, 0x03, 0x01, 0x02, 0x03]);
        assert!(ber_to_der(&[0x24, 0x80, 0x02, 0x01, 0x01, 0x00, 0x00]).is_none());
    }

    #[test]
    fn encodes_long_lengths_minimally() {
        let ber: Vec<u8> = [&[0x30, 0x80, 0x04, 0x81, 0xc8][..], &[0xee; 200], &[0x00, 0x00]].concat();
        let der = ber_to_der(&ber).unwrap();
        assert_eq!(&der[..5], &[0x30, 0x81, 0xcb, 0x04, 0x81]);
        assert_eq!(der.len(), 206);
    }

    #[test]
    fn refuses_malformed_ber() {
        assert!(ber_to_der(&[0x04, 0x80, 0x01, 0x00, 0x00]).is_none());
        assert!(ber_to_der(&[0x30, 0x80, 0x02, 0x01, 0x01]).is_none());
        assert!(ber_to_der(&[]).is_none());
        let deep: Vec<u8> = std::iter::repeat_n([0x30, 0x80], 100).flatten().chain(std::iter::repeat_n(0x00, 200)).collect();
        assert!(ber_to_der(&deep).is_none());
    }
}
