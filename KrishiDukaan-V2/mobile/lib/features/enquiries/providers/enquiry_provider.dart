import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/data/paged_feed.dart';
import '../../../core/models/enquiry_model.dart';
import '../data/enquiry_repository.dart';

final enquiryRepositoryProvider = Provider((_) => EnquiryRepository());

/// The signed-in seller's enquiries newest first: the first 30 live, older
/// pages on [PagedFeed.loadMore].
final sellerEnquiriesFeedProvider =
    Provider.family<PagedFeed<EnquiryModel>, String>((ref, phone) {
  final feed = ref.watch(enquiryRepositoryProvider).feedForSeller(phone);
  ref.onDispose(feed.dispose);
  return feed;
});

final sellerEnquiriesProvider =
    StreamProvider.family<List<EnquiryModel>, String>((ref, phone) {
  return ref.watch(sellerEnquiriesFeedProvider(phone)).stream;
});

/// Count of enquiries the seller hasn't followed up yet — drives the badge on
/// the dashboard tile so a new lead is visible without opening the screen.
final openEnquiryCountProvider = Provider.family<int, String>((ref, phone) {
  final list = ref.watch(sellerEnquiriesProvider(phone)).value ?? const [];
  return list.where((e) => e.isOpen).length;
});
