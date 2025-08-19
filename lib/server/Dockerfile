# Use Dart SDK image
FROM dart:stable AS build

WORKDIR /app

# Copy pubspec and resolve deps
COPY pubspec.yaml .
RUN dart pub get

# Copy the rest of the source
COPY . .

# Compile executable
RUN dart compile exe bin/gmail_parser.dart -o bin/gmail_parser

# Runtime image
FROM debian:stable-slim
WORKDIR /app

COPY --from=build /app/bin/gmail_parser /app/

CMD ["./gmail_parser"]
