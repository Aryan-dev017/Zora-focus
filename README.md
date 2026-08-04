# Zora — Focus & Productivity App

A mobile-first focus and productivity application built 
for deep work sessions. Designed to help users build 
sustainable focus habits through ambient music, 
session tracking, and a guided experience.

## Features
- User authentication (email + planned Google OAuth)
- Curated focus music library
- Animated mascot companion
- Subscription paywall (RevenueCat + Google Play Billing)
- Session-based focus tracking

## Tech Stack
- React Native (Expo) — mobile framework
- TypeScript — full codebase
- EAS Build — APK / AAB production builds
- Supabase — PostgreSQL database + auth
- RevenueCat — subscription management & entitlements
- Sentry — crash reporting & production monitoring

## Setup
1. Clone the repo
2. Run npm install
3. Add .env variables (Supabase + RevenueCat keys)
4. Run npx expo start

## Status
Active development — Google OAuth and additional 
focus modes in progress.
