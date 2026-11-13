use percent_encoding::percent_decode_str;
use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

pub const SCHEME: &str = "formask";

const MAX_QUESTION_CHARS: usize = 601;

fn question_from(path: &str) -> Option<String> {
    let decoded = percent_decode_str(path.trim_start_matches('/')).decode_utf8().ok()?;
    let question: String = decoded.trim().chars().take(MAX_QUESTION_CHARS).collect();
    (!question.is_empty()).then_some(question)
}

fn reply(status: StatusCode, body: &'static str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain")
        .header("Access-Control-Allow-Origin", "*")
        .header("Cache-Control", "no-store")
        .body(body.as_bytes().to_vec())
        .unwrap_or_default()
}

pub fn answer<R: Runtime>(context: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = context.app_handle();
    let Some(question) = question_from(request.uri().path()) else {
        return responder.respond(reply(StatusCode::BAD_REQUEST, "no"));
    };
    let Some(window) = app.get_webview_window(context.webview_label()) else {
        return responder.respond(reply(StatusCode::NOT_FOUND, "no"));
    };
    app.dialog()
        .message(question)
        .title("Question from this form")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("Yes".into(), "No".into()))
        .parent(&window)
        .show(move |yes| responder.respond(reply(StatusCode::OK, if yes { "yes" } else { "no" })));
}

#[cfg(test)]
mod tests {
    use super::{question_from, MAX_QUESTION_CHARS};

    #[test]
    fn reads_the_question_from_the_path() {
        assert_eq!(question_from("/Clear%20the%20form%3F").as_deref(), Some("Clear the form?"));
        assert_eq!(question_from("/%20%20Sure%3F%0A").as_deref(), Some("Sure?"));
    }

    #[test]
    fn refuses_an_empty_or_undecodable_question() {
        assert_eq!(question_from("/"), None);
        assert_eq!(question_from("/%20%20"), None);
        assert_eq!(question_from("/%FF%FE"), None);
    }

    #[test]
    fn shortens_a_long_question() {
        let long = "x".repeat(MAX_QUESTION_CHARS + 200);
        assert_eq!(question_from(&format!("/{long}")).map(|question| question.chars().count()), Some(MAX_QUESTION_CHARS));
    }
}
