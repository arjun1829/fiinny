import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/enquiry_model.dart';
import '../data/enquiry_repository.dart';

final enquiryRepositoryProvider = Provider((_) => EnquiryRepository());

/// The signed-in seller's enquiries, newest first.
final sellerEnquiriesProvider =
    StreamProvider.family<List<EnquiryModel>, String>((ref, phone) {
  return ref.watch(enquiryRepositoryProvider).watchForSeller(phone);
});

/// Count of enquiries the seller hasn't followed up yet — drives the badge on
/// the dashboard tile so a new lead is visible without opening the screen.
final openEnquiryCountProvider = Provider.family<int, String>((ref, phone) {
  final list = ref.watch(sellerEnquiriesProvider(phone)).value ?? const [];
  return list.where((e) => e.isOpen).length;
});
