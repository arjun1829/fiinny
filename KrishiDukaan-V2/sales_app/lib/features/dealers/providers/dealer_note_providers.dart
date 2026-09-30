import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/dealer_note.dart';
import '../data/dealer_note_repository.dart';

final dealerNoteRepositoryProvider = Provider<DealerNoteRepository>(
  (ref) => DealerNoteRepository(),
);

/// A dealer's notes, oldest first — keyed by dealerId so switching between
/// dealers never shows another dealer's notes.
final dealerNotesProvider = FutureProvider.family<List<DealerNote>, String>((
  ref,
  dealerId,
) async {
  return ref.watch(dealerNoteRepositoryProvider).forDealer(dealerId);
});
