use super::algorithms::sha1;
use super::certs;
use super::cms::{self, Cms};
use super::pdf::signature_contents;
use super::revocation::{self, Fetched, Pair};
use super::trust::{self, TrustOptions};
use super::tsa;
use super::types::{ValidationMaterial, VerifyItem, VriEntry};
use super::util::hex_upper;
use super::verify::RFC3161;

fn add(list: &mut Vec<Vec<u8>>, blob: Vec<u8>) -> usize {
    match list.iter().position(|known| *known == blob) {
        Some(index) => index,
        None => {
            list.push(blob);
            list.len() - 1
        }
    }
}

fn note(entry: &mut Vec<usize>, index: usize) {
    if !entry.contains(&index) {
        entry.push(index);
    }
}

fn signers(contents: &[u8], document_timestamp: bool) -> Result<Vec<Cms>, String> {
    if document_timestamp {
        return Ok(vec![tsa::read_token(contents)?.cms]);
    }
    let signature = cms::parse(contents)?;
    let token = signature.timestamp_token().and_then(|token| tsa::read_token(&token).ok());
    Ok(std::iter::once(signature).chain(token.map(|token| token.cms)).collect())
}

fn collect_chain(signer: &Cms, at: i64, output: &mut ValidationMaterial, entry: &mut VriEntry) {
    let Some(index) = signer.signer_index() else { return };
    let mut candidates = vec![signer.certificates[index].1.clone()];
    candidates.extend(signer.certificates.iter().enumerate().filter(|(other, _)| *other != index).map(|(_, (_, der))| der.clone()));
    let options = TrustOptions { online: true, fetch_issuers: true, anchors: Vec::new() };
    let result = trust::evaluate(&candidates, at, &options);
    let chain = if result.chain.is_empty() { candidates } else { result.chain };
    let parsed: Vec<_> = chain.iter().filter_map(|der| certs::parse(der).ok().map(|certificate| (certificate, der.clone()))).collect();
    for (_, der) in &parsed {
        note(&mut entry.certs, add(&mut output.material.certs, der.clone()));
    }
    for pair in parsed.windows(2).filter(|pair| !certs::is_self_issued(&pair[0].0)) {
        let link = Pair { cert: &pair[0].0, issuer: &pair[1].0, issuer_der: &pair[1].1 };
        match revocation::fetch(&link, at) {
            Ok(Fetched::Ocsp(response, _)) => note(&mut entry.ocsps, add(&mut output.material.ocsps, response)),
            Ok(Fetched::Crl(crl, _)) => note(&mut entry.crls, add(&mut output.material.crls, crl)),
            Err(err) => {
                let name = certs::display_name(&pair[0].0.tbs_certificate.subject);
                output.problems.push(format!("Couldn't get revocation data for “{name}”: {err}."));
            }
        }
    }
}

pub fn collect(pdf: &[u8], items: &[VerifyItem], at: i64) -> ValidationMaterial {
    let mut output = ValidationMaterial::default();
    for item in items {
        let contents = match signature_contents(pdf, &item.byte_range) {
            Ok(contents) => contents,
            Err(err) => {
                output.problems.push(err);
                continue;
            }
        };
        let signers = match signers(&contents, item.sub_filter == RFC3161) {
            Ok(signers) => signers,
            Err(err) => {
                output.problems.push(err);
                continue;
            }
        };
        let mut entry = VriEntry::default();
        for signer in &signers {
            collect_chain(signer, at, &mut output, &mut entry);
        }
        output.vri.insert(hex_upper(&sha1(&contents)), entry);
    }
    output
}
