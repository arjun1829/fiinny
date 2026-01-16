// lib/stubs/telephony_stub.dart

class Telephony {
  static final Telephony instance = Telephony();

  Future<List<SmsMessage>> getInboxSms({
    List<SmsColumn>? columns,
    List<OrderBy>? sortOrder,
    SmsFilter? filter,
  }) async {
    return [];
  }

  void listenIncomingSms({
    required Function(SmsMessage) onNewMessage,
    Function(SmsMessage)? onBackgroundMessage,
    bool? listenInBackground,
  }) {}
}

class SmsMessage {
  int? get date => 0;
  String? get body => '';
  String? get address => '';
  int? get id => 0;
  int? get threadId => 0;
  bool? get read => false;
}

enum SmsColumn {
  address,
  body,
  date,
  id,
  threadId,
  read,
  // Add others if needed
}

class OrderBy {
  OrderBy(SmsColumn column, {Sort? sort});
}

enum Sort {
  asc,
  desc,
}

class SmsFilter {
  // Minimal if needed
}
