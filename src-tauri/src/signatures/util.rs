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
}
