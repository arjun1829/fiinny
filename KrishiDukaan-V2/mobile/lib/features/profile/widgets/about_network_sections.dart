import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_text_styles.dart';
import 'india_map_data.dart';

/// One brand logo from Admin > About page (`siteContent/about.partners`).
class AboutPartner {
  final String id;
  final String name;
  final String logoUrl;
  final String? website;

  const AboutPartner({required this.id, required this.name, required this.logoUrl, this.website});

  static AboutPartner? fromMap(Object? raw) {
    if (raw is! Map) return null;
    final logo = (raw['logoUrl'] ?? '').toString();
    if (logo.isEmpty) return null;
    final site = (raw['website'] ?? '').toString();
    return AboutPartner(
      id: (raw['id'] ?? logo).toString(),
      name: (raw['name'] ?? '').toString(),
      logoUrl: logo,
      website: site.isEmpty ? null : site,
    );
  }
}

/// `siteContent/about` — the same doc web's AboutView.tsx reads, so an
/// admin's logo / image changes reach the app without a release.
class AboutPageContent {
  final bool partnersEnabled;
  final String? partnersTitle;
  final String? partnersSubtitle;
  final String? centerLogoUrl;
  final List<AboutPartner> partners;
  final bool presenceEnabled;
  final String? presenceTitle;
  final String? presenceSubtitle;

  const AboutPageContent({
    required this.partnersEnabled,
    this.partnersTitle,
    this.partnersSubtitle,
    this.centerLogoUrl,
    required this.partners,
    required this.presenceEnabled,
    this.presenceTitle,
    this.presenceSubtitle,
  });

  factory AboutPageContent.fromMap(Map<String, dynamic>? d) {
    String? str(String key) {
      final v = (d?[key] ?? '').toString().trim();
      return v.isEmpty ? null : v;
    }

    final rawPartners = d?['partners'];
    return AboutPageContent(
      partnersEnabled: d?['partnersEnabled'] == true,
      partnersTitle: str('partnersTitle'),
      partnersSubtitle: str('partnersSubtitle'),
      centerLogoUrl: str('centerLogoUrl'),
      partners: rawPartners is List
          ? rawPartners.map(AboutPartner.fromMap).whereType<AboutPartner>().toList()
          : const [],
      presenceEnabled: d?['presenceEnabled'] == true,
      presenceTitle: str('presenceTitle'),
      presenceSubtitle: str('presenceSubtitle'),
    );
  }

  bool get showPartners => partnersEnabled && partners.isNotEmpty;
  bool get showPresence => presenceEnabled;
}

/// A single one-shot read, kept for the app session — About is rarely
/// opened twice, and it never needs a live listener.
final aboutContentProvider = FutureProvider<AboutPageContent>((ref) async {
  final snap = await FirebaseFirestore.instance.collection('siteContent').doc('about').get();
  return AboutPageContent.fromMap(snap.data());
});

const _maxOrbit = 8;
const _accent = AppColors.primaryLight;

Future<void> _open(String? url) async {
  if (url == null) return;
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class _LogoCircle extends StatelessWidget {
  final String url;
  final String semanticLabel;
  final double size;
  final double borderWidth;

  const _LogoCircle({required this.url, required this.semanticLabel, required this.size, this.borderWidth = 1});

  @override
  Widget build(BuildContext context) {
    final cache = (size * MediaQuery.devicePixelRatioOf(context)).round();
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.16),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primaryContainer, width: borderWidth),
        boxShadow: const [BoxShadow(color: AppColors.cardShadow, blurRadius: 16, offset: Offset(0, 6))],
      ),
      child: CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.contain,
        memCacheWidth: cache,
        fadeInDuration: const Duration(milliseconds: 200),
        errorWidget: (_, _, _) => const Icon(Icons.storefront_outlined, color: AppColors.onSurfaceVariant),
        imageBuilder: (context, provider) => Semantics(
          label: semanticLabel,
          image: true,
          child: Image(image: provider, fit: BoxFit.contain),
        ),
      ),
    );
  }
}

/// Animated "brands connected with us": KrishiDukan in the centre, partner
/// logos orbiting it — mirrors web's AboutPartnersSection. Logos stay upright
/// (only their positions rotate); the animation stops when the system asks
/// for reduced motion and is paused by TickerMode when the route is hidden.
class AboutPartnersOrbit extends StatefulWidget {
  final String label;
  final String title;
  final String? subtitle;
  final List<AboutPartner> partners;
  final String? centerLogoUrl;

  const AboutPartnersOrbit({
    super.key,
    required this.label,
    required this.title,
    this.subtitle,
    required this.partners,
    this.centerLogoUrl,
  });

  @override
  State<AboutPartnersOrbit> createState() => _AboutPartnersOrbitState();
}

class _AboutPartnersOrbitState extends State<AboutPartnersOrbit> with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(vsync: this, duration: const Duration(seconds: 60));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _spin.stop();
    } else if (!_spin.isAnimating) {
      _spin.repeat();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final orbit = widget.partners.take(_maxOrbit).toList();
    final extra = widget.partners.skip(_maxOrbit).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(widget.label.toUpperCase(),
            textAlign: TextAlign.center,
            style: AppTextStyles.caption.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.bold,
              letterSpacing: 1.2,
            )),
        const SizedBox(height: 6),
        Text(widget.title, textAlign: TextAlign.center, style: AppTextStyles.heading2),
        if (widget.subtitle != null) ...[
          const SizedBox(height: 8),
          Text(widget.subtitle!,
              textAlign: TextAlign.center,
              style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
        ],
        const SizedBox(height: 16),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: AspectRatio(
              aspectRatio: 1,
              child: LayoutBuilder(builder: (context, box) {
                final side = box.maxWidth;
                final radius = side * 0.38;
                final item = side * (orbit.length <= 6 ? 0.24 : 0.21);
                final center = side * 0.36;
                // Built once; only their positions change per frame.
                final logos = [
                  for (final p in orbit)
                    GestureDetector(
                      onTap: p.website == null ? null : () => _open(p.website),
                      child: _LogoCircle(url: p.logoUrl, semanticLabel: p.name, size: item),
                    ),
                ];

                return RepaintBoundary(
                  child: AnimatedBuilder(
                    animation: _spin,
                    builder: (context, _) {
                      final offset = _spin.value * 2 * math.pi;
                      final angles = [
                        for (var i = 0; i < orbit.length; i++)
                          (i / orbit.length) * 2 * math.pi - math.pi / 2 + offset,
                      ];
                      return Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned.fill(
                            child: CustomPaint(
                              painter: _OrbitPainter(
                                angles: angles,
                                radius: radius,
                                innerGap: center / 2,
                                outerGap: item / 2,
                              ),
                            ),
                          ),
                          for (var i = 0; i < orbit.length; i++)
                            Positioned(
                              left: side / 2 + radius * math.cos(angles[i]) - item / 2,
                              top: side / 2 + radius * math.sin(angles[i]) - item / 2,
                              child: logos[i],
                            ),
                          Positioned(
                            left: (side - center) / 2,
                            top: (side - center) / 2,
                            child: widget.centerLogoUrl != null
                                ? _LogoCircle(url: widget.centerLogoUrl!, semanticLabel: 'KrishiDukan', size: center, borderWidth: 4)
                                : _CenterAppIcon(size: center),
                          ),
                        ],
                      );
                    },
                  ),
                );
              }),
            ),
          ),
        ),
        if (extra.isNotEmpty) ...[
          const SizedBox(height: 12),
          SizedBox(
            height: 84,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(vertical: 6),
              itemCount: extra.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => GestureDetector(
                onTap: extra[i].website == null ? null : () => _open(extra[i].website),
                child: _LogoCircle(url: extra[i].logoUrl, semanticLabel: extra[i].name, size: 72),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _CenterAppIcon extends StatelessWidget {
  final double size;
  const _CenterAppIcon({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.14),
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.primaryContainer, width: 4),
        boxShadow: const [BoxShadow(color: AppColors.cardShadow, blurRadius: 24, offset: Offset(0, 8))],
      ),
      child: ClipOval(child: Image.asset('assets/icons/app_icon.png', fit: BoxFit.contain, semanticLabel: 'KrishiDukan')),
    );
  }
}

class _OrbitPainter extends CustomPainter {
  final List<double> angles;
  final double radius;
  final double innerGap;
  final double outerGap;

  _OrbitPainter({required this.angles, required this.radius, required this.innerGap, required this.outerGap});

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    canvas.drawCircle(c, radius + size.width * 0.09, ring..color = _accent.withValues(alpha: 0.10));
    canvas.drawCircle(c, radius, ring..color = _accent.withValues(alpha: 0.25));
    canvas.drawCircle(c, radius - size.width * 0.13, ring..color = _accent.withValues(alpha: 0.12));

    final spoke = Paint()
      ..color = _accent.withValues(alpha: 0.45)
      ..strokeWidth = 1;
    final dot = Paint()..color = _accent;
    for (final a in angles) {
      final dir = Offset(math.cos(a), math.sin(a));
      final end = c + dir * (radius - outerGap);
      canvas.drawLine(c + dir * innerGap, end, spoke);
      canvas.drawCircle(end, 3, dot);
    }
  }

  @override
  bool shouldRepaint(_OrbitPainter old) => old.angles != angles || old.radius != radius;
}

/// "Presence across India": a map of India where presence dots pop up,
/// rippling out from Maharashtra, then the busiest towns pulse. Same fixed
/// map and dots as the website (india_map_data.dart), so it costs no reads.
/// Starts once scrolled into view; reduce-motion shows the finished map.
class AboutPresenceCard extends StatefulWidget {
  final String label;
  final String title;
  final String? subtitle;
  final String mapLabel;

  const AboutPresenceCard({
    super.key,
    required this.label,
    required this.title,
    this.subtitle,
    required this.mapLabel,
  });

  @override
  State<AboutPresenceCard> createState() => _AboutPresenceCardState();
}

/// Gap between dots popping in (~620 dots fill in under 3s), and pop length.
const _dotStaggerMs = 4.5;
const _dotPopMs = 550;
/// Dots this big (the busiest towns) keep pulsing after the intro.
const _pulseMinRadius = 8.5;

// Map palette (matches public/images/india-presence-map.svg on the web).
const _mapSea = Color(0xFFD4EBF5);
const _mapSeaDeep = Color(0xFFBFE0EF);
const _mapLand = Color(0xFFECEEE6);
const _mapBorder = Color(0xFFC4C9BD);
const _mapIndia = Color(0xFFF8F7F0);
const _mapIndiaEdge = Color(0xFF8FA58F);
const _mapStates = Color(0xFFCFD5C8);
const _mapCountryText = Color(0xFF8A9488);
const _mapSeaText = Color(0xFF6F9FB8);
const _mapCityText = Color(0xFF3F4A40);
const _dotFill = Color(0x80F0602C);
const _dotEdge = Color(0xB3C43D10);
const _pulseColor = Color(0xFFE25024);

final int _dotCount = kPresenceDots.length ~/ 3;
final int _introMs = (_dotCount * _dotStaggerMs).round() + _dotPopMs;

class _AboutPresenceCardState extends State<AboutPresenceCard> with TickerProviderStateMixin {
  late final AnimationController _intro = AnimationController(
    vsync: this,
    duration: Duration(milliseconds: _introMs),
  )..addStatusListener((status) {
      if (status == AnimationStatus.completed && !_reduced) _pulse.repeat();
    });
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 3200));
  ScrollPosition? _scroll;
  bool _reduced = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduced = MediaQuery.disableAnimationsOf(context);
    if (_reduced) {
      _detach();
      _pulse.stop();
      _intro.value = 1;
      return;
    }
    if (_intro.isAnimating || _intro.isCompleted) return;
    final scroll = Scrollable.maybeOf(context)?.position;
    if (scroll != _scroll) {
      _detach();
      _scroll = scroll?..addListener(_startWhenVisible);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _startWhenVisible());
  }

  void _startWhenVisible() {
    if (!mounted || _intro.isAnimating || _intro.isCompleted) return;
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return;
    final top = box.localToGlobal(Offset.zero).dy;
    if (top < MediaQuery.sizeOf(context).height * 0.85) {
      _detach();
      _intro.forward();
    }
  }

  void _detach() {
    _scroll?.removeListener(_startWhenVisible);
    _scroll = null;
  }

  @override
  void dispose() {
    _detach();
    _intro.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(color: _accent, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text(widget.label.toUpperCase(),
                style: AppTextStyles.caption.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                )),
          ],
        ),
        const SizedBox(height: 6),
        Text(widget.title, style: AppTextStyles.heading2),
        if (widget.subtitle != null) ...[
          const SizedBox(height: 8),
          Text(widget.subtitle!, style: AppTextStyles.bodySmall.copyWith(color: AppColors.onSurfaceVariant)),
        ],
        const SizedBox(height: 12),
        Semantics(
          label: widget.mapLabel,
          image: true,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: kPresenceMapWidth / kPresenceMapHeight,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Map and labels never change: each painted once and cached.
                  const RepaintBoundary(child: CustomPaint(painter: _BaseMapPainter())),
                  RepaintBoundary(child: CustomPaint(painter: _PresenceDotsPainter(_intro))),
                  RepaintBoundary(child: CustomPaint(painter: _PulsePainter(_pulse))),
                  const RepaintBoundary(child: CustomPaint(painter: _CityLabelsPainter())),
                  Positioned(
                    right: 8,
                    bottom: 4,
                    child: Text(
                      'Map data: Natural Earth, DataMeet (CC BY 4.0)',
                      style: AppTextStyles.caption.copyWith(fontSize: 7, color: AppColors.onSurfaceVariant),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Map paths hold only absolute M/L/Z commands; each is parsed once per run.
Path _parseMapPath(String d) {
  final path = Path();
  final tokens = RegExp(r'[MLZ]|-?\d*\.?\d+').allMatches(d).map((m) => m[0]!).toList();
  var cmd = 'M';
  for (var i = 0; i < tokens.length;) {
    final t = tokens[i];
    if (t == 'Z') {
      path.close();
      i++;
    } else if (t == 'M' || t == 'L') {
      cmd = t;
      i++;
    } else {
      if (i + 1 >= tokens.length) break;
      final x = double.parse(tokens[i]);
      final y = double.parse(tokens[i + 1]);
      cmd == 'M' ? path.moveTo(x, y) : path.lineTo(x, y);
      i += 2;
    }
  }
  return path;
}

final Path _landPath = _parseMapPath(kMapLand);
final Path _indiaPath = _parseMapPath(kMapIndia);
final Path _statesPath = _parseMapPath(kMapStates);

/// Map units → screen; labels and dots get a little extra size on phones so
/// they stay readable when the 600-unit map is ~330px wide.
double _mapScale(Size size) => size.width / kPresenceMapWidth;
double _dotBoost(double s) => 1 + 0.4 * (1 - s).clamp(0.0, 1.0);

void _paintLabel(Canvas canvas, String text, Offset at, TextStyle style, {TextAlign align = TextAlign.center, bool halo = false}) {
  TextPainter painter(TextStyle st) => TextPainter(
        text: TextSpan(text: text, style: st),
        textDirection: TextDirection.ltr,
        textAlign: align,
      )..layout();
  final fill = painter(style);
  final dx = switch (align) {
    TextAlign.right => -fill.width,
    TextAlign.left => 0.0,
    _ => -fill.width / 2,
  };
  final pos = at + Offset(dx, -fill.height / 2);
  if (halo) {
    // A style can't carry both color and foreground, so the halo is built fresh.
    painter(TextStyle(
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      letterSpacing: style.letterSpacing,
      foreground: Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeJoin = StrokeJoin.round
        ..color = Colors.white,
    )).paint(canvas, pos);
  }
  fill.paint(canvas, pos);
}

class _BaseMapPainter extends CustomPainter {
  const _BaseMapPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(0, 0.7),
          radius: 1.1,
          colors: [_mapSeaDeep, _mapSea],
        ).createShader(rect),
    );
    final s = _mapScale(size);
    canvas.save();
    canvas.scale(s);
    canvas.drawPath(_landPath, Paint()..color = _mapLand);
    canvas.drawPath(
      _landPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..strokeJoin = StrokeJoin.round
        ..color = _mapBorder,
    );
    canvas.drawPath(_indiaPath, Paint()..color = _mapIndia);
    canvas.drawPath(
      _statesPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.7
        ..strokeJoin = StrokeJoin.round
        ..color = _mapStates,
    );
    canvas.drawPath(
      _indiaPath,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2 / s.clamp(0.5, 1.0)
        ..strokeJoin = StrokeJoin.round
        ..color = _mapIndiaEdge,
    );
    canvas.restore();

    for (final (x, y, text, isSea) in kMapAreaLabels) {
      _paintLabel(
        canvas,
        text,
        Offset(x * s, y * s),
        TextStyle(
          fontSize: isSea ? 10 : 9,
          fontWeight: isSea ? FontWeight.w400 : FontWeight.w600,
          fontStyle: isSea ? FontStyle.italic : FontStyle.normal,
          letterSpacing: isSea ? 0.5 : 0.2,
          color: isSea ? _mapSeaText : _mapCountryText,
        ),
      );
    }
  }

  @override
  bool shouldRepaint(_BaseMapPainter oldDelegate) => false;
}

class _PresenceDotsPainter extends CustomPainter {
  final AnimationController intro;

  _PresenceDotsPainter(this.intro) : super(repaint: intro);

  static final _fill = Paint()..color = _dotFill;
  static final _edge = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 0.8
    ..color = _dotEdge;

  @override
  void paint(Canvas canvas, Size size) {
    final s = _mapScale(size);
    final boost = _dotBoost(s);
    final elapsed = intro.value * _introMs;
    for (var i = 0; i < _dotCount; i++) {
      final local = ((elapsed - i * _dotStaggerMs) / _dotPopMs).clamp(0.0, 1.0);
      if (local <= 0) break; // later dots haven't started yet
      final r = kPresenceDots[i * 3 + 2] * s * boost * Curves.easeOutBack.transform(local);
      if (r <= 0) continue;
      final c = Offset(kPresenceDots[i * 3] * s, kPresenceDots[i * 3 + 1] * s);
      canvas.drawCircle(c, r, _fill);
      canvas.drawCircle(c, r, _edge);
    }
  }

  @override
  bool shouldRepaint(_PresenceDotsPainter oldDelegate) => oldDelegate.intro != intro;
}

/// Indices of the dots that pulse (computed once).
final List<int> _pulseDots = [
  for (var i = 0; i < _dotCount; i++)
    if (kPresenceDots[i * 3 + 2] >= _pulseMinRadius) i,
];

class _PulsePainter extends CustomPainter {
  final AnimationController pulse;

  _PulsePainter(this.pulse) : super(repaint: pulse);

  static final _ring = Paint()
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.6;

  @override
  void paint(Canvas canvas, Size size) {
    if (!pulse.isAnimating) return;
    final s = _mapScale(size);
    final boost = _dotBoost(s);
    for (var n = 0; n < _pulseDots.length; n++) {
      // Staggered like the web (each ring ~0.38s after the previous).
      final phase = (pulse.value - n * 0.119) % 1.0;
      if (phase > 0.7) continue;
      final t = Curves.easeOut.transform(phase / 0.7);
      final i = _pulseDots[n];
      _ring.color = _pulseColor.withValues(alpha: 0.7 * (1 - t));
      canvas.drawCircle(
        Offset(kPresenceDots[i * 3] * s, kPresenceDots[i * 3 + 1] * s),
        kPresenceDots[i * 3 + 2] * s * boost * (1 + 2 * t),
        _ring,
      );
    }
  }

  @override
  bool shouldRepaint(_PulsePainter oldDelegate) => oldDelegate.pulse != pulse;
}

class _CityLabelsPainter extends CustomPainter {
  const _CityLabelsPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final s = _mapScale(size);
    final dot = Paint()..color = _mapCityText;
    final fontSize = (9.5 * s).clamp(8.0, 11.0);
    final style = TextStyle(fontSize: fontSize, fontWeight: FontWeight.w600, color: _mapCityText);
    for (final (x, y, name, left) in kMapCities) {
      final at = Offset(x * s, y * s);
      canvas.drawCircle(at, 1.8, dot);
      _paintLabel(
        canvas,
        name,
        at + Offset(left ? -4 : 4, 0),
        style,
        align: left ? TextAlign.right : TextAlign.left,
        halo: true,
      );
    }
  }

  @override
  bool shouldRepaint(_CityLabelsPainter oldDelegate) => false;
}
