import 'package:flutter/material.dart';
import 'dart:ui';
// Ensure google_fonts is available or use standard
import '../../core/formatters/inr.dart';

class BankStats {
  final double totalDebit;
  final double totalCredit;
  final int txCount;

  const BankStats({
    required this.totalDebit,
    required this.totalCredit,
    required this.txCount,
  });
}

class BankCardItem extends StatefulWidget {
  final String bankName;
  final String cardType;
  final String last4;
  final String holderName;
  final String expiry;
  final String colorTheme; // 'blue', 'purple', 'black', 'green', 'red'
  final String? logoAsset;
  final BankStats? stats;
  final VoidCallback? onTap;

  const BankCardItem({
    Key? key,
    required this.bankName,
    required this.cardType,
    required this.last4,
    required this.holderName,
    this.expiry = '12/28',
    this.colorTheme = 'blue',
    this.logoAsset,
    this.stats,
    this.onTap,
  }) : super(key: key);

  @override
  State<BankCardItem> createState() => _BankCardItemState();
}

class _BankCardItemState extends State<BankCardItem> {
  bool _showStats = false;

  LinearGradient _getGradient() {
    switch (widget.colorTheme) {
      case 'purple':
        return const LinearGradient(
          colors: [Color(0xFF4C1D95), Color(0xFF3730A3)], // purple-900 to indigo-800
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case 'black':
        return const LinearGradient(
          colors: [Color(0xFF111827), Color(0xFF000000)], // gray-900 to black
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case 'green':
        return const LinearGradient(
          colors: [Color(0xFF065F46), Color(0xFF059669)], // green-800 to emerald-600
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case 'red':
        return const LinearGradient(
          colors: [Color(0xFF7F1D1D), Color(0xFFBE123C)], // red-900 to rose-700
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
      case 'blue':
      default:
        return const LinearGradient(
          colors: [Color(0xFF1E3A8A), Color(0xFF155E75)], // blue-900 to cyan-800
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        if (widget.stats != null) {
          setState(() {
            _showStats = !_showStats;
          });
        }
        widget.onTap?.call();
      },
      child: Container(
        width: 320,
        height: 192,
        margin: const EdgeInsets.only(right: 16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),

          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 1),
                gradient: LinearGradient(
                   begin: Alignment.topLeft,
                   end: Alignment.bottomRight,
                   colors: [
                     // If background is dark/solid, these will tint it.
                     // But for true glass on a light background, we need semi-transparent whites/greys.
                     // Since individual banks have colors, we can mix their color in.
                     _getGradient().colors.first.withValues(alpha: 0.85),
                     _getGradient().colors.first.withValues(alpha: 0.65),
                   ],
                ),
                boxShadow: [
                  BoxShadow(
                    color: _getGradient().colors.first.withValues(alpha: 0.3),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: Stack(
          children: [
            // Decorative circles
            Positioned(
              right: -64,
              top: -64,
              child: Container(
                width: 192,
                height: 192,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
            ),
             Positioned(
              left: -64,
              bottom: -64,
              child: Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
            ),

            // Gloss
            Container(
              height: 96,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.white.withValues(alpha: 0.08),
                    Colors.transparent,
                  ],
                ),
              ),
            ),

            // Content
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: _showStats && widget.stats != null
                  ? _buildStatsView()
                  : _buildCardView(),
            ),
          ],
                ),
              ),
            ),
          ),
        ),
    );
  }

  Widget _buildStatsView() {
    final s = widget.stats!;
    return Container(
      key: const ValueKey('stats'),
      padding: const EdgeInsets.all(24),
      color: Colors.black.withValues(alpha: 0.6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Analytics',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                  letterSpacing: 0.5,
                ),
              ),
              InkWell(
                onTap: () => setState(() => _showStats = false),
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.visibility_off, color: Colors.white, size: 18),
                ),
              ),
            ],
          ),
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('TOTAL SPEND', style: TextStyle(color: Colors.grey[300], fontSize: 10, letterSpacing: 1.0, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(INR.f(s.totalDebit), style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('TRANSACTIONS', style: TextStyle(color: Colors.grey[300], fontSize: 10, letterSpacing: 1.0, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text('${s.txCount}', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('CREDITS', style: TextStyle(color: Colors.green[300], fontSize: 10, letterSpacing: 1.0, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    Text(INR.f(s.totalCredit), style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCardView() {
    return Padding(
      key: const ValueKey('card'),
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (widget.logoAsset != null)
                    Container(
                      width: 40,
                      height: 40,
                      margin: const EdgeInsets.only(right: 12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.all(4),
                      child: Image.asset(widget.logoAsset!, errorBuilder: (_,__,___) => const SizedBox()),
                    ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        widget.bankName.toUpperCase(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          letterSpacing: 1.0,
                          fontFamily: 'monospace', 
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.cardType.toUpperCase(),
                        style: TextStyle(
                          color: Colors.grey[300],
                          fontSize: 10,
                          letterSpacing: 1.5,
                          fontWeight: FontWeight.w300,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              Row(
                children: [
                  if (widget.stats != null)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: InkWell(
                        onTap: () => setState(() => _showStats = true),
                        borderRadius: BorderRadius.circular(20),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: Colors.transparent,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: const Icon(Icons.remove_red_eye_outlined, color: Colors.white70, size: 20),
                        ),
                      ),
                    ),
                  const Icon(Icons.wifi, color: Colors.white70),
                ],
              ),
            ],
          ),

          // Chip & Number
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 32,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xFFFDE047), Color(0xFFEAB308)]),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Colors.yellow[800]!),
                ),
                child: Center(
                  child: Container(height: 1, color: Colors.yellow[900]!.withValues(alpha: 0.3), width: 30),
                ),
              ),
              Row(
                children: [
                  Text(
                    '•••• •••• •••• ',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 18,
                      letterSpacing: 2.0,
                      fontFamily: 'monospace',
                    ),
                  ),
                  Text(
                    widget.last4,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2.0,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Footer
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CARD HOLDER', style: TextStyle(color: Colors.grey[400], fontSize: 8, letterSpacing: 1.0)),
                  const SizedBox(height: 2),
                  Text(widget.holderName.toUpperCase(), style: TextStyle(color: Colors.grey[100], fontSize: 13, fontWeight: FontWeight.w500, letterSpacing: 1.0)),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('VALID THRU', style: TextStyle(color: Colors.grey[400], fontSize: 8, letterSpacing: 1.0)),
                  const SizedBox(height: 2),
                  Text(widget.expiry, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.0)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
// Placeholder class to handle BoxUi reference in dummy code
class BoxUi {
  static  bool get iconImage => false;
}
