import 'package:http/http.dart' as http;
// remove: import 'package:googleapis/gmail/v1.dart' as gmail;  // keep only if you need GmailApi symbols

// before
// class _AuthClient extends gmail.AuthClient { ... }
// Future<gmail.StreamedResponse> send(gmail.BaseRequest request) {

// after
class _AuthClient extends http.BaseClient {
  final Map<String, String> headers;
  final http.Client _inner = http.Client();
  _AuthClient(this.headers);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    request.headers.addAll(headers);
    return _inner.send(request);
  }
}
