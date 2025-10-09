import 'package:flutter/material.dart';

class AddRecurringHubSheet extends StatelessWidget {
  final String userPhone;
  final String friendId;
  final String? friendName;

  const AddRecurringHubSheet({
    Key? key,
    required this.userPhone,
    required this.friendId,
    this.friendName,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final title = friendName == null || friendName!.isEmpty
        ? 'Add'
        : 'Add for $friendName';

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(children: [
              Text(title, style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w900)),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.close_rounded),
                onPressed: () => Navigator.pop(context),
              ),
            ]),
            const SizedBox(height: 8),

            _Grid(
              tiles: [
                _Tile(
                  icon: Icons.account_balance_rounded,
                  label: 'EMI / Loan',
                  onTap: () async {
                    // Re-use existing AddLoanScreen route
                    final res = await Navigator.pushNamed(
                      context,
                      '/addLoan',
                      arguments: {
                        'userId': userPhone,
                        // allow your AddLoanScreen to know this was launched
                        // from a “friend recurring” flow
                        'splitWith': [friendId], // optional: preselect split
                        'context': 'friendRecurring',
                      },
                    );
                    Navigator.pop(context, res); // bubble result up
                  },
                ),
                _Tile(
                  icon: Icons.subscriptions_rounded,
                  label: 'Subscription',
                  onTap: () async {
                    // TODO replace with your real Add Subscription screen/route
                    final res = await Navigator.pushNamed(context, '/addSubscription', arguments: {
                      'userId': userPhone,
                      'friendId': friendId,
                    });
                    Navigator.pop(context, res);
                  },
                ),
                _Tile(
                  icon: Icons.receipt_long_rounded,
                  label: 'Bill / Utility',
                  onTap: () async {
                    // TODO replace with your real Add Bill screen/route
                    final res = await Navigator.pushNamed(context, '/addBill', arguments: {
                      'userId': userPhone,
                      'friendId': friendId,
                    });
                    Navigator.pop(context, res);
                  },
                ),
                _Tile(
                  icon: Icons.repeat_rounded,
                  label: 'Custom Recurring',
                  onTap: () async {
                    // TODO if you have a generic recurring form
                    final res = await Navigator.pushNamed(context, '/addRecurringGeneric', arguments: {
                      'userId': userPhone,
                      'friendId': friendId,
                    });
                    Navigator.pop(context, res);
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Grid extends StatelessWidget {
  final List<_Tile> tiles;
  const _Grid({required this.tiles});

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      physics: const NeverScrollableScrollPhysics(),
      shrinkWrap: true,
      crossAxisCount: 2,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.25,
      children: tiles,
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _Tile({
    Key? key,
    required this.icon,
    required this.label,
    required this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                height: 48, width: 48,
                decoration: BoxDecoration(
                  color: Colors.teal.withOpacity(.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: Colors.teal.shade800),
              ),
              const SizedBox(height: 10),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 13.5,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
