import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/providers/auth_provider.dart';
import '../../../core/router/app_router.dart';
import '../../../core/utils/ist_date.dart';
import '../../../core/widgets/state_views.dart';
import '../data/dealer.dart';
import '../data/dealer_note.dart';
import '../providers/dealer_note_providers.dart';
import '../providers/dealer_providers.dart';

class DealerDetailScreen extends ConsumerWidget {
  const DealerDetailScreen({super.key, required this.dealerId});

  final String dealerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dealerAsync = ref.watch(dealerByIdProvider(dealerId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Dealer Details'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go(Routes.dealers),
        ),
      ),
      body: dealerAsync.when(
        loading: () => const LoadingView(),
        error: (e, _) => ErrorView(
          message: 'Could not load this dealer.',
          onRetry: () => ref.invalidate(dealerByIdProvider(dealerId)),
        ),
        data: (dealer) {
          if (dealer == null) {
            return EmptyView(
              icon: Icons.help_outline_rounded,
              title: 'Dealer not found',
              message: 'This dealer may have been removed.',
              action: FilledButton(
                onPressed: () => context.go(Routes.dealers),
                style: FilledButton.styleFrom(minimumSize: const Size(180, 48)),
                child: const Text('Back to dealers'),
              ),
            );
          }
          return _DealerDetailBody(dealer: dealer);
        },
      ),
    );
  }
}

class _DealerDetailBody extends ConsumerWidget {
  const _DealerDetailBody({required this.dealer});

  final Dealer dealer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        if (dealer.imageUrl != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.network(
              dealer.imageUrl!,
              width: double.infinity,
              fit: BoxFit.contain,
              errorBuilder: (_, _, _) => Container(
                height: 180,
                color: AppColors.surfaceContainerLow,
                alignment: Alignment.center,
                child: const Icon(
                  Icons.broken_image_outlined,
                  color: AppColors.outline,
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
        ],

        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    dealer.shopName,
                    style: const TextStyle(
                      fontSize: 19,
                      fontWeight: FontWeight.w800,
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    dealer.ownerName,
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: AppColors.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            StatusChip(
              label: dealer.type.label,
              color: AppColors.primary,
              background: AppColors.primaryContainer,
            ),
          ],
        ),

        const SizedBox(height: 20),
        const SectionLabel('Contact'),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _InfoRow(
                icon: Icons.phone_outlined,
                label: 'Phone',
                value: dealer.phone.isEmpty ? '—' : dealer.phone,
              ),
              const Divider(height: 1, indent: 52),
              _InfoRow(
                icon: Icons.place_outlined,
                label: 'Address',
                value: dealer.address.isEmpty ? '—' : dealer.address,
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),
        const SectionLabel('Location'),
        AppCard(
          padding: EdgeInsets.zero,
          child: _InfoRow(
            icon: Icons.my_location_rounded,
            label: 'Saved coordinates',
            value: dealer.geo == null
                ? 'Not captured'
                : '${dealer.geo!.lat.toStringAsFixed(5)}, '
                      '${dealer.geo!.lng.toStringAsFixed(5)}',
            trailing: dealer.geo == null
                ? null
                : TextButton.icon(
                    onPressed: () => launchUrl(
                      Uri.parse(
                        'https://www.google.com/maps/dir/?api=1'
                        '&destination=${dealer.geo!.lat},${dealer.geo!.lng}',
                      ),
                      mode: LaunchMode.externalApplication,
                    ),
                    icon: const Icon(Icons.navigation_outlined, size: 16),
                    label: const Text('Maps'),
                  ),
          ),
        ),

        const SizedBox(height: 20),
        const SectionLabel('Dealer Interest'),
        AppCard(
          child: dealer.interest == null
              ? const StatusChip(
                  label: 'Not set',
                  color: AppColors.outline,
                  background: AppColors.surfaceContainer,
                )
              : StatusChip(
                  label: dealer.interest!.label,
                  color: AppColors.primary,
                  background: AppColors.primaryContainer,
                ),
        ),

        const SizedBox(height: 24),
        _NotesSection(dealerId: dealer.id),
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.trailing,
  });

  final IconData icon;
  final String label;
  final String value;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: AppColors.outline),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppColors.outline,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.onSurface,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

// ── Notes ────────────────────────────────────────────────────────────────

class _NotesSection extends ConsumerStatefulWidget {
  const _NotesSection({required this.dealerId});

  final String dealerId;

  @override
  ConsumerState<_NotesSection> createState() => _NotesSectionState();
}

class _NotesSectionState extends ConsumerState<_NotesSection> {
  final _controller = TextEditingController();
  bool _adding = false;
  bool _saving = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final uid = ref.read(currentUidProvider);
    final text = _controller.text.trim();
    if (uid == null || text.isEmpty || _saving) return;

    setState(() => _saving = true);
    try {
      await ref
          .read(dealerNoteRepositoryProvider)
          .add(uid, widget.dealerId, text);
      _controller.clear();
      ref.invalidate(dealerNotesProvider(widget.dealerId));
      if (mounted) setState(() => _adding = false);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not save the note. Please try again.'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete(DealerNote note) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete note?'),
        content: const Text('This note will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await ref.read(dealerNoteRepositoryProvider).delete(note.id);
      ref.invalidate(dealerNotesProvider(widget.dealerId));
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Could not delete the note. Please try again.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = ref.watch(currentUidProvider);
    final notesAsync = ref.watch(dealerNotesProvider(widget.dealerId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          'Notes',
          trailing: _adding
              ? null
              : TextButton.icon(
                  onPressed: () => setState(() => _adding = true),
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  icon: const Icon(Icons.add_rounded, size: 16),
                  label: const Text('Add note'),
                ),
        ),

        if (_adding)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _controller,
                  autofocus: true,
                  maxLines: 3,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'Order discussed, follow-up needed…',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => setState(() {
                                _adding = false;
                                _controller.clear();
                              }),
                        child: const Text('Cancel'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed:
                            _saving || _controller.text.trim().isEmpty
                            ? null
                            : _save,
                        child: _saving
                            ? const SizedBox(
                                height: 17,
                                width: 17,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.2,
                                  valueColor: AlwaysStoppedAnimation(
                                    Colors.white,
                                  ),
                                ),
                              )
                            : const Text('Save'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

        if (_adding) const SizedBox(height: 12),

        notesAsync.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: LoadingView(),
          ),
          error: (e, _) => ErrorView(
            message: 'Could not load notes.',
            onRetry: () => ref.invalidate(dealerNotesProvider(widget.dealerId)),
          ),
          data: (notes) {
            if (notes.isEmpty) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: EmptyView(
                  icon: Icons.sticky_note_2_outlined,
                  title: 'No notes yet',
                  message: 'Notes you add about this dealer show up here.',
                ),
              );
            }
            return Column(
              children: [
                for (final note in notes) ...[
                  _NoteCard(
                    note: note,
                    canDelete: note.salesExecutiveId == uid,
                    onDelete: () => _delete(note),
                  ),
                  const SizedBox(height: 10),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _NoteCard extends StatelessWidget {
  const _NoteCard({
    required this.note,
    required this.canDelete,
    required this.onDelete,
  });

  final DealerNote note;
  final bool canDelete;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  note.note,
                  style: const TextStyle(
                    fontSize: 13.5,
                    color: AppColors.onSurface,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${IstDate.relativeLabel(note.createdAt)} · '
                  '${IstDate.timeLabel(note.createdAt)}',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.outline,
                  ),
                ),
              ],
            ),
          ),
          if (canDelete)
            IconButton(
              onPressed: onDelete,
              visualDensity: VisualDensity.compact,
              icon: const Icon(
                Icons.delete_outline_rounded,
                size: 18,
                color: AppColors.error,
              ),
            ),
        ],
      ),
    );
  }
}
