import 'package:google_mobile_ads/google_mobile_ads.dart';

class AdConfig {
  static bool authorized = false;
  static AdRequest adRequest() => AdRequest(nonPersonalizedAds: !authorized);
}
