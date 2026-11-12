use percent_encoding::percent_decode_str;
use serde::de::DeserializeOwned;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

use super::SeenCertificates;
use super::certs;
use super::identities;
use super::ipc::{encode_material, parse_verify};
use super::panel::{self, Shown};
use super::sign;
use super::trust::TrustOptions;
use super::types::{SignRequest, SignatureVerdict, SigningIdentity, TimestampRequest, ValidationRequest};
use super::util::now;
use super::validation;
use super::verify::{Context, verify_all};
use crate::header;

fn body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err("Expected raw document bytes".into()),
    }
}

fn request_json<T: DeserializeOwned>(request: &Request<'_>) -> Result<T, String> {
    let encoded = header(request, "x-request").ok_or("Missing request details")?;
    let decoded = percent_decode_str(encoded).decode_utf8().map_err(|err| err.to_string())?;
    serde_json::from_str(&decoded).map_err(|err| format!("The request couldn't be read: {err}"))
}

async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn verify_signatures(app: AppHandle, request: Request<'_>) -> Result<Vec<SignatureVerdict>, String> {
    let body = body(&request)?;
    let outcomes = blocking(move || {
        let envelope = parse_verify(&body)?;
        let material = envelope.dss.clone().unwrap_or_default();
        let options = TrustOptions { online: true, fetch_issuers: false, anchors: Vec::new() };
        let context = Context { material: &material, has_dss: envelope.dss.is_some(), trust: &options, now: now() };
        Ok(verify_all(envelope.pdf, &envelope.items, &context))
    })
    .await?;
    let seen = app.state::<SeenCertificates>();
    Ok(outcomes
        .into_iter()
        .map(|outcome| {
            outcome.chains.into_iter().for_each(|chain| seen.remember(chain));
            outcome.verdict
        })
        .collect())
}

#[tauri::command]
pub async fn list_signing_identities(app: AppHandle) -> Result<Vec<SigningIdentity>, String> {
    let described = blocking(|| {
        let options = TrustOptions { online: true, fetch_issuers: true, anchors: Vec::new() };
        let at = now();
        Ok(identities::all().iter().filter_map(|identity| identities::describe(identity, at, &options)).collect::<Vec<_>>())
    })
    .await?;
    let seen = app.state::<SeenCertificates>();
    Ok(described
        .into_iter()
        .map(|(identity, chain)| {
            seen.remember(chain);
            identity
        })
        .collect())
}

#[tauri::command]
pub async fn sign_pdf(app: AppHandle, window: Window, request: Request<'_>) -> Result<Response, String> {
    let pdf = body(&request)?;
    let details: SignRequest = request_json(&request)?;
    let timestamp_url = details.timestamp_url.clone();
    let prompt_name = details.document_name.clone();
    let prepared = blocking(move || sign::prepare(pdf, &details)).await?;
    let confirmed = app
        .dialog()
        .message(sign::confirmation(&prompt_name, &prepared))
        .title("Sign Digitally")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Sign".into(), "Cancel".into()))
        .parent(&window)
        .blocking_show();
    if !confirmed {
        return Ok(Response::new(Vec::new()));
    }
    let signed = blocking(move || sign::sign_without_timestamp(prepared)).await?;
    let der = match timestamp_url {
        None => signed.der.clone(),
        Some(url) => {
            let (der, signature) = (signed.der.clone(), signed.signature.clone());
            match blocking(move || sign::timestamped(&der, &signature, &url)).await {
                Ok(stamped) => stamped,
                Err(error) => {
                    let without = app
                        .dialog()
                        .message(sign::without_timestamp_prompt(&prompt_name, &error))
                        .title("Sign without a timestamp?")
                        .kind(MessageDialogKind::Warning)
                        .buttons(MessageDialogButtons::OkCancelCustom("Sign Without Timestamp".into(), "Cancel".into()))
                        .parent(&window)
                        .blocking_show();
                    if !without {
                        return Ok(Response::new(Vec::new()));
                    }
                    signed.der.clone()
                }
            }
        }
    };
    let pdf = blocking(move || sign::embed(signed, &der)).await?;
    Ok(Response::new(pdf))
}

#[tauri::command]
pub async fn fetch_validation_data(request: Request<'_>) -> Result<Response, String> {
    let pdf = body(&request)?;
    let details: ValidationRequest = request_json(&request)?;
    let output = blocking(move || Ok(validation::collect(&pdf, &details.items, now()))).await?;
    Ok(Response::new(encode_material(&output)))
}

#[tauri::command]
pub async fn timestamp_pdf(request: Request<'_>) -> Result<Response, String> {
    let pdf = body(&request)?;
    let details: TimestampRequest = request_json(&request)?;
    let stamped = blocking(move || sign::timestamp_document(pdf, &details)).await?;
    Ok(Response::new(stamped))
}

fn certificate_summary_text(chain: &[Vec<u8>]) -> String {
    let Some(certificate) = chain.first().and_then(|der| certs::parse(der).ok()) else { return String::new() };
    let summary = certs::summary(&certificate, &chain[0]);
    let mut lines = vec![format!("Issued to: {}", summary.common_name)];
    lines.extend(summary.email.map(|email| format!("Email: {email}")));
    lines.extend(summary.organization.map(|organization| format!("Organization: {organization}")));
    lines.push(format!("Issued by: {}", summary.issuer));
    lines.push(format!("Valid: {} to {}", &summary.not_before[..10], &summary.not_after[..10]));
    lines.push(format!("Serial number: {}", summary.serial));
    lines.push(format!("SHA-256 fingerprint: {}", summary.fingerprint));
    lines.join("\n")
}

#[tauri::command]
pub async fn show_certificate(app: AppHandle, window: Window, request: Request<'_>) -> Result<(), String> {
    let chain = match request.body() {
        InvokeBody::Raw(bytes) if !bytes.is_empty() => vec![bytes.clone()],
        _ => {
            let fingerprint = header(&request, "x-fingerprint").ok_or("Missing certificate")?.to_string();
            match app.state::<SeenCertificates>().chain(&fingerprint) {
                Some(chain) => chain,
                None => blocking(move || identities::find(&fingerprint).map(|identity| vec![identity.der])).await?,
            }
        }
    };
    let (sender, receiver) = std::sync::mpsc::channel();
    let target = window.clone();
    let panel_chain = chain.clone();
    app.run_on_main_thread(move || {
        let _ = sender.send(panel::show(&target, &panel_chain));
    })
    .map_err(|err| err.to_string())?;
    let shown = tauri::async_runtime::spawn_blocking(move || receiver.recv()).await.map_err(|err| err.to_string())?.map_err(|err| err.to_string())??;
    if matches!(shown, Shown::Unavailable) {
        app.dialog()
            .message(certificate_summary_text(&chain))
            .title("Certificate")
            .kind(MessageDialogKind::Info)
            .parent(&window)
            .show(|_| {});
    }
    Ok(())
}
