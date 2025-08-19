import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'theme_provider.dart';
import 'app_theme.dart';

class ThemeSelectorWidget extends StatelessWidget {
  final Map<FiinnyTheme, String> themeNames = {
    FiinnyTheme.fresh: "Fresh Mint",
    FiinnyTheme.royal: "Royal Blue",
    FiinnyTheme.sunny: "Sunny Coral",
    FiinnyTheme.midnight: "Midnight",
    FiinnyTheme.classic: "Classic Purple",
    FiinnyTheme.pureDark: "Pure Dark",
    FiinnyTheme.lightMinimal: "Minimal Light",
  };

  final Map<FiinnyTheme, List<Color>> themeSwatches = {
    FiinnyTheme.fresh: [tiffanyBlue, mintGreen, deepTeal],
    FiinnyTheme.royal: [royalBlue, royalGold, Colors.white],
    FiinnyTheme.sunny: [sunnyLemon, sunnyCoral, Colors.orangeAccent],
    FiinnyTheme.midnight: [midnight, midnightBlue, Colors.white],
    FiinnyTheme.classic: [Colors.deepPurple, Colors.purple, Colors.white],
    FiinnyTheme.pureDark: [Colors.black, Colors.white, Colors.grey],
    FiinnyTheme.lightMinimal: [Colors.white, Colors.black, Colors.grey],
  };

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            "Choose Your Theme",
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 0.3),
          ),
          const SizedBox(height: 24),
          GridView.count(
            shrinkWrap: true,
            crossAxisCount: 2,
            mainAxisSpacing: 24,
            crossAxisSpacing: 16,
            childAspectRatio: 1.22,
            physics: const NeverScrollableScrollPhysics(),
            children: FiinnyTheme.values.map((fiinnyTheme) {
              return GestureDetector(
                onTap: () async {
                  themeProvider.setTheme(fiinnyTheme);
                  Navigator.of(context).maybePop();
                },
                child: Card(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  elevation: themeProvider.theme == fiinnyTheme ? 11 : 2,
                  color: Colors.white,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 9),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      border: themeProvider.theme == fiinnyTheme
                          ? Border.all(color: Colors.blueAccent, width: 3)
                          : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: themeSwatches[fiinnyTheme]!
                              .map((color) => Container(
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            width: 23,
                            height: 23,
                            decoration: BoxDecoration(
                              color: color,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.grey.shade200, width: 1),
                            ),
                          ))
                              .toList(),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          themeNames[fiinnyTheme]!,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 15.5,
                            color: Colors.black87,
                          ),
                        ),
                        if (themeProvider.theme == fiinnyTheme)
                          const Padding(
                            padding: EdgeInsets.only(top: 10),
                            child: Icon(Icons.check_circle, color: Colors.blueAccent),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
