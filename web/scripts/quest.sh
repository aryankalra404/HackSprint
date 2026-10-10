#!/bin/sh
# Connects the Quest to this laptop for the demo: the headset reaches the web app at localhost:3000,
# and (if scrcpy is installed) its view is mirrored to a window for the big screen.
set -e
if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install it with: brew install android-platform-tools"
  exit 1
fi
if [ -z "$(adb devices | sed -n '2p')" ]; then
  echo "No headset found. Plug the Quest in (or connect over wireless adb) and allow USB debugging in the headset."
  exit 1
fi
adb reverse tcp:3000 tcp:3000
echo "Headset linked: it reaches this laptop at http://localhost:3000"
if command -v scrcpy >/dev/null 2>&1; then
  # Quest renders both eyes side by side; crop to the left eye for a normal-looking mirror
  exec scrcpy --crop 1920:1832:0:0 --max-fps 60 --window-title "DryRun headset"
else
  echo "To mirror the headset on the big screen, install scrcpy (brew install scrcpy) and run this again."
fi
