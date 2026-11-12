use std::ffi::c_void;

use security_framework::identity::SecIdentity;
use security_framework::item::{ItemClass, ItemSearchOptions, Limit, Reference, SearchResult};
use security_framework_sys::item::kSecAttrTokenID;

use super::certs;
use super::trust::{self, TrustOptions};
use super::types::SigningIdentity;

pub struct KeychainIdentity {
    pub fingerprint: String,
    pub der: Vec<u8>,
    pub identity: SecIdentity,
}

fn search(token: bool) -> Vec<SecIdentity> {
    let mut options = ItemSearchOptions::new();
    options.class(ItemClass::identity()).load_refs(true).limit(Limit::All);
    if token {
        options.access_group_token();
    }
    let results = options.search().unwrap_or_default();
    results
        .into_iter()
        .filter_map(|result| match result {
            SearchResult::Ref(Reference::Identity(identity)) => Some(identity),
            _ => None,
        })
        .collect()
}

pub fn all() -> Vec<KeychainIdentity> {
    let mut found: Vec<KeychainIdentity> = Vec::new();
    for identity in search(false).into_iter().chain(search(true)) {
        let Ok(certificate) = identity.certificate() else { continue };
        let der = certificate.to_der();
        let fingerprint = certs::fingerprint(&der);
        if !found.iter().any(|known| known.fingerprint == fingerprint) {
            found.push(KeychainIdentity { fingerprint, der, identity });
        }
    }
    found
}

pub fn find(fingerprint: &str) -> Result<KeychainIdentity, String> {
    all()
        .into_iter()
        .find(|identity| identity.fingerprint.eq_ignore_ascii_case(fingerprint))
        .ok_or_else(|| "That signing certificate is no longer in your keychain or connected.".into())
}

fn is_hardware(identity: &SecIdentity) -> bool {
    let Ok(key) = identity.private_key() else { return false };
    let token_id = unsafe { kSecAttrTokenID } as *const c_void;
    key.attributes().contains_key(&token_id)
}

pub const UNTRUSTED_WARNING: &str = "Readers may not be able to verify this certificate.";

pub fn describe(identity: &KeychainIdentity, now: i64, options: &TrustOptions) -> Option<(SigningIdentity, Vec<Vec<u8>>)> {
    let certificate = certs::parse(&identity.der).ok()?;
    let key = certs::key_info(&certificate);
    let problems = certs::signing_problems(&certificate, now);
    let result = trust::evaluate(std::slice::from_ref(&identity.der), now, options);
    let warnings = if result.trusted { Vec::new() } else { vec![UNTRUSTED_WARNING.to_string()] };
    let chain = if result.chain.is_empty() { vec![identity.der.clone()] } else { result.chain };
    let described = SigningIdentity {
        fingerprint: identity.fingerprint.clone(),
        certificate: certs::summary(&certificate, &identity.der),
        key_type: key.map_or(super::types::KeyType::Rsa, |key| key.key_type),
        key_bits: key.map_or(0, |key| key.bits),
        hardware: is_hardware(&identity.identity),
        trusted: result.trusted,
        usable: problems.is_empty(),
        problems,
        warnings,
    };
    Some((described, chain))
}
