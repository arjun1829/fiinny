# LifeMap – The Global Smart Finance & Split App 🌍

## Overview
LifeMap helps users everywhere track expenses, split bills, set goals, analyze spending, and collaborate with friends/groups. Built with Flutter, Firebase, and love.

---

## Features
- AI-powered expense/goal management
- One-tap split with friends (Splitwise-style, but global)
- OCR, SMS, email parsing for auto-import
- Cloud backup, dark mode, emoji everywhere!
- Group/trip finance, mood analytics, leaderboard, and more

---

## Project Structure

```plaintext
/lib
  /models      # Data models (Expense, Income, Goal, etc.)
  /providers   # State management (Provider/ChangeNotifier)
  /services    # Business logic, Firebase, parsing, OCR
  /screens     # App screens/views
  /widgets     # Custom widgets (charts, cards, pickers)
  /utils       # Constants, helpers, formatters, validators
  main.dart
  app_theme.dart
  routes.dart
