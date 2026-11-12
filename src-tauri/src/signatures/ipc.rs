use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::types::{Material, ValidationMaterial, VerifyItem, VriEntry};

type Span = [usize; 2];

#[derive(Deserialize)]
struct DssSpans {
    certs: Vec<Span>,
    ocsps: Vec<Span>,
    crls: Vec<Span>,
}

#[derive(Deserialize)]
struct VerifyHeader {
    items: Vec<VerifyItem>,
    pdf: Span,
    dss: Option<DssSpans>,
}

pub struct VerifyEnvelope<'a> {
    pub items: Vec<VerifyItem>,
    pub pdf: &'a [u8],
    pub dss: Option<Material>,
}

fn split(body: &[u8]) -> Result<(&[u8], &[u8]), String> {
    let length = body.get(..4).map(|prefix| u32::from_le_bytes([prefix[0], prefix[1], prefix[2], prefix[3]]) as usize).ok_or("The request is empty")?;
    let json = body.get(4..4 + length).ok_or("The request header is cut short")?;
    Ok((json, &body[4 + length..]))
}

fn slice(payload: &[u8], [offset, length]: Span) -> Result<&[u8], String> {
    offset.checked_add(length).and_then(|end| payload.get(offset..end)).ok_or_else(|| "A part of the request is outside the body".into())
}

fn blobs(payload: &[u8], spans: &[Span]) -> Result<Vec<Vec<u8>>, String> {
    spans.iter().map(|&span| slice(payload, span).map(<[u8]>::to_vec)).collect()
}

pub fn parse_verify(body: &[u8]) -> Result<VerifyEnvelope<'_>, String> {
    let (json, payload) = split(body)?;
    let header: VerifyHeader = serde_json::from_slice(json).map_err(|err| format!("The request couldn't be read: {err}"))?;
    let dss = match header.dss {
        Some(spans) => Some(Material { certs: blobs(payload, &spans.certs)?, ocsps: blobs(payload, &spans.ocsps)?, crls: blobs(payload, &spans.crls)? }),
        None => None,
    };
    Ok(VerifyEnvelope { items: header.items, pdf: slice(payload, header.pdf)?, dss })
}

#[derive(Serialize)]
struct MaterialHeader<'a> {
    certs: Vec<Span>,
    ocsps: Vec<Span>,
    crls: Vec<Span>,
    vri: &'a BTreeMap<String, VriEntry>,
    problems: &'a [String],
}

pub fn encode_material(output: &ValidationMaterial) -> Vec<u8> {
    let mut payload = Vec::new();
    let mut place = |list: &[Vec<u8>]| -> Vec<Span> {
        list.iter()
            .map(|blob| {
                let span = [payload.len(), blob.len()];
                payload.extend_from_slice(blob);
                span
            })
            .collect()
    };
    let material = &output.material;
    let header = MaterialHeader {
        certs: place(&material.certs),
        ocsps: place(&material.ocsps),
        crls: place(&material.crls),
        vri: &output.vri,
        problems: &output.problems,
    };
    let json = serde_json::to_vec(&header).unwrap_or_default();
    let mut body = (json.len() as u32).to_le_bytes().to_vec();
    body.extend_from_slice(&json);
    body.extend_from_slice(&payload);
    body
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(json: &str, payload: &[u8]) -> Vec<u8> {
        let mut body = (json.len() as u32).to_le_bytes().to_vec();
        body.extend_from_slice(json.as_bytes());
        body.extend_from_slice(payload);
        body
    }

    #[test]
    fn reads_the_verify_envelope() {
        let json = r#"{"items":[{"id":"s1","byteRange":[0,1,2,3],"subFilter":"ETSI.CAdES.detached","claimedTime":null}],"pdf":[0,4],"dss":{"certs":[[4,2]],"ocsps":[],"crls":[[6,1]]}}"#;
        let body = envelope(json, b"%PDFabc");
        let parsed = parse_verify(&body).unwrap();
        assert_eq!(parsed.pdf, b"%PDF");
        assert_eq!(parsed.items[0].byte_range, [0, 1, 2, 3]);
        let dss = parsed.dss.unwrap();
        assert_eq!(dss.certs, vec![b"ab".to_vec()]);
        assert_eq!(dss.crls, vec![b"c".to_vec()]);
    }

    #[test]
    fn refuses_spans_outside_the_body() {
        let body = envelope(r#"{"items":[],"pdf":[2,10],"dss":null}"#, b"%PDF");
        assert!(parse_verify(&body).is_err());
        assert!(parse_verify(&[1, 0]).is_err());
        assert!(parse_verify(&envelope(r#"{"items":[],"pdf":[18446744073709551615,2],"dss":null}"#, b"x")).is_err());
    }

    #[test]
    fn encodes_validation_material_with_offsets() {
        let mut output = ValidationMaterial::default();
        output.material.certs = vec![vec![1, 2], vec![3]];
        output.material.crls = vec![vec![9]];
        output.vri.insert("AB".into(), VriEntry { certs: vec![0, 1], ocsps: vec![], crls: vec![0] });
        let body = encode_material(&output);
        let (json, payload) = split(&body).unwrap();
        let value: serde_json::Value = serde_json::from_slice(json).unwrap();
        assert_eq!(value["certs"], serde_json::json!([[0, 2], [2, 1]]));
        assert_eq!(value["crls"], serde_json::json!([[3, 1]]));
        assert_eq!(value["vri"]["AB"]["certs"], serde_json::json!([0, 1]));
        assert_eq!(payload, &[1, 2, 3, 9]);
    }
}
