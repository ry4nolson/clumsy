use cmpv2::status::PkiStatus;
use der::asn1::{Int, OctetString};
use der::{Any, Decode, Encode};
use security_framework::random::SecRandom;
use x509_cert::spki::AlgorithmIdentifier;
use x509_tsp::{MessageImprint, TimeStampReq, TimeStampResp, TspVersion, TstInfo};

use super::algorithms::Digest;
use super::cms::{self, Cms, ID_TST_INFO};
use super::http;

const DEFAULT_URL: &str = "http://timestamp.digicert.com";
const FALLBACK_URL: &str = "http://timestamp.sectigo.com";

pub struct Token {
    pub cms: Cms,
    pub info: TstInfo,
    pub time: i64,
}

pub fn read_token(der: &[u8]) -> Result<Token, String> {
    let cms = cms::parse(der)?;
    if cms.signed_data.encap_content_info.econtent_type != ID_TST_INFO {
        return Err("The timestamp token doesn't hold timestamp information".into());
    }
    let content = cms.econtent().ok_or("The timestamp token is empty")?;
    let info = TstInfo::from_der(&content).map_err(|err| format!("The timestamp couldn't be read: {err}"))?;
    let time = info.gen_time.to_unix_duration().as_secs() as i64;
    Ok(Token { cms, info, time })
}

impl Token {
    pub fn imprint_matches(&self, message: &[&[u8]]) -> bool {
        let imprint = &self.info.message_imprint;
        Digest::from_oid(&imprint.hash_algorithm.oid).is_some_and(|digest| digest.hash(message) == imprint.hashed_message.as_bytes())
    }

    pub fn check(&self) -> Result<usize, String> {
        let digest = self.cms.digest().ok_or("The timestamp uses an unsupported digest")?;
        let content = self.cms.econtent().ok_or("The timestamp token is empty")?;
        if !self.cms.content_type_is(ID_TST_INFO) {
            return Err("The timestamp's signed content type is wrong".into());
        }
        self.cms.check(&digest.hash(&[&content])).map_err(|err| format!("The timestamp's signature isn't valid: {err}"))
    }
}

fn nonce_int(nonce: &[u8]) -> Result<Int, String> {
    Int::new(nonce).map_err(|err| err.to_string())
}

pub fn new_nonce() -> [u8; 8] {
    let mut nonce = [0u8; 8];
    let _ = SecRandom::default().copy_bytes(&mut nonce);
    nonce[0] = (nonce[0] & 0x7f) | 0x01;
    nonce
}

pub fn request(imprint: &[u8], nonce: &[u8]) -> Result<Vec<u8>, String> {
    let request = TimeStampReq {
        version: TspVersion::V1,
        message_imprint: MessageImprint {
            hash_algorithm: AlgorithmIdentifier::<Any> { oid: Digest::Sha256.oid(), parameters: None },
            hashed_message: OctetString::new(imprint).map_err(|err| err.to_string())?,
        },
        req_policy: None,
        nonce: Some(nonce_int(nonce)?),
        cert_req: true,
        extensions: None,
    };
    request.to_der().map_err(|err| err.to_string())
}

pub fn accept(response: &[u8], imprint: &[u8], nonce: &[u8]) -> Result<Vec<u8>, String> {
    let response = TimeStampResp::from_der(response).map_err(|err| format!("the reply couldn't be read ({err})"))?;
    if !matches!(response.status.status, PkiStatus::Accepted | PkiStatus::GrantedWithMods) {
        return Err(format!("the server refused the request ({:?})", response.status.status));
    }
    let token = response.time_stamp_token.ok_or("the reply has no timestamp")?.to_der().map_err(|err| err.to_string())?;
    let parsed = read_token(&token)?;
    let expected = &parsed.info.message_imprint;
    if expected.hash_algorithm.oid != Digest::Sha256.oid() || expected.hashed_message.as_bytes() != imprint {
        return Err("the timestamp is for different data".into());
    }
    if parsed.info.nonce.as_ref() != Some(&nonce_int(nonce)?) {
        return Err("the timestamp doesn't answer this request".into());
    }
    parsed.check()?;
    Ok(token)
}

fn fetch_from(url: &str, imprint: &[u8]) -> Result<Vec<u8>, String> {
    let nonce = new_nonce();
    let body = request(imprint, &nonce)?;
    let reply = http::post(url, "application/timestamp-query", body, http::TIMESTAMP_TIMEOUT).map_err(|err| format!("couldn't reach {url} ({err})"))?;
    accept(&reply, imprint, &nonce).map_err(|err| format!("{url}: {err}"))
}

pub fn fetch(url: &str, imprint: &[u8]) -> Result<Vec<u8>, String> {
    let result = fetch_from(url, imprint);
    let result = match result {
        Err(_) if url.trim_end_matches('/') == DEFAULT_URL => fetch_from(FALLBACK_URL, imprint).or(result),
        result => result,
    };
    result.map_err(|err| format!("timestamp: {err}"))
}
