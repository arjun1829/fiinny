import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/credit_card_model.dart';
import 'dart:math';

class BankCardWidget extends StatelessWidget {
  final CreditCardModel card;
  final VoidCallback? onTap;
  final bool showMaskedNumber;

  const BankCardWidget({
    super.key,
    required this.card,
    this.onTap,
    this.showMaskedNumber = true,
  });

  @override
  Widget build(BuildContext context) {
    // Generate a consistent gradient based on the bank name or card type
    final Gradient gradient = _getCardGradient(card.bankName, card.cardType);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 320,
        height: 200,
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: gradient,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 12,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Stack(
          children: [
            // Decorative circles
            Positioned(
              right: -50,
              top: -50,
              child: Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.05),
                ),
              ),
            ),
             Positioned(
              bottom: -80,
              left: -40,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withOpacity(0.08),
                ),
              ),
            ),
            
            Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Header: Bank Name and Logo (placeholder icon)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        card.bankName.toUpperCase(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                          letterSpacing: 1.2,
                        ),
                      ),
                      _getCardNetworkIcon(card.cardType),
                    ],
                  ),

                  // Chip Icon
                  const Icon(
                    Icons.sim_card_outlined, // Placeholder for chip
                    color: Colors.amberAccent,
                    size: 36,
                  ),
                  
                  // Card Number
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (showMaskedNumber) ...[
                        _buildDotGroup(),
                        _buildDotGroup(),
                        _buildDotGroup(),
                        Text(
                          card.last4Digits,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontFamily: 'Courier', 
                            fontWeight: FontWeight.bold,
                            letterSpacing: 2.0,
                          ),
                        ),
                      ] else 
                         Text(
                          card.last4Digits, // Fallback if we want to show full but don't have it
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                    ],
                  ),

                  // Footer: Name and Expiry (Mock expiry if null)
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          card.cardholderName.toUpperCase(),
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      Column(
                         crossAxisAlignment: CrossAxisAlignment.end,
                         children: [
                           const Text(
                             'VALID THRU',
                             style: TextStyle(
                               color: Colors.white54,
                               fontSize: 7,
                             ),
                           ),
                           Text(
                             _formatExpiry(card.dueDate), // Using due date as a proxy/placeholder if expiry not in model
                             style: const TextStyle(
                               color: Colors.white,
                               fontWeight: FontWeight.bold,
                               fontSize: 14,
                             ),
                           ),
                         ],
                      )
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDotGroup() {
    return const Row(
      children: [
        Text('••••', style: TextStyle(color: Colors.white54, fontSize: 18, letterSpacing: 2)),
        SizedBox(width: 12),
      ],
    );
  }

  String _formatExpiry(DateTime date) {
    // Just a dummy formatter for now since model doesn't strictly have expiry, using due date logic helper
    // In real app, expiry would be a separate field.
    return '${date.month.toString().padLeft(2, '0')}/${(date.year % 100).toString().padLeft(2, '0')}'; 
  }

  Widget _getCardNetworkIcon(String type) {
    IconData icon;
    Color color;
    switch (type.toLowerCase()) {
      case 'visa':
        icon = Icons.payment; // Replace with asset in real app
        color = Colors.white; 
        break;
      case 'mastercard':
        icon = Icons.credit_card;
        color = Colors.orange;
        break;
      case 'amex':
       icon = Icons.star;
       color = Colors.blue;
       break;
      default:
        icon = Icons.credit_card;
        color = Colors.white;
    }
    // Returning a simple text for now for clarity if assets missing
    return Text(
      type.toUpperCase(),
      style: const TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w900,
        fontStyle: FontStyle.italic,
        fontSize: 16,
      ),
    );
  }

  Gradient _getCardGradient(String bankName, String cardType) {
    // Deterministic random color based on bank name hash to keep it consistent
    final int hash = bankName.codeUnits.fold(0, (p, c) => p + c);
    
    if (bankName.toLowerCase().contains('hdfc')) {
      return const LinearGradient(
        colors: [Color(0xFF004d7a), Color(0xFF0087d1)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    if (bankName.toLowerCase().contains('icici')) {
       return const LinearGradient(
        colors: [Color(0xFF8B2323), Color(0xFFE35D5B)],
         begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    if (bankName.toLowerCase().contains('sbi')) {
       return const LinearGradient(
        colors: [Color(0xFF2E7D32), Color(0xFF81C784)],
         begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }

    // Default gradients based on mod
    final List<List<Color>> defaults = [
      [const Color(0xFF1A2980), const Color(0xFF26D0CE)], // Blue
      [const Color(0xFF8E2DE2), const Color(0xFF4A00E0)], // Purple
      [const Color(0xFF000000), const Color(0xFF434343)], // Black
      [const Color(0xFFC04848), const Color(0xFF480048)], // Red/Purple
    ];

    return LinearGradient(
      colors: defaults[hash % defaults.length],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }
}
