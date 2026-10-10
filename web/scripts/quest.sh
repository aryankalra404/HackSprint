#!/bin/sh
# USB fallback for the Quest: the headset reaches the web app at localhost:3000 (it prefers Wi-Fi when the
# laptop and headset share a network), and (if scrcpy is installed) its view is mirrored for the big screen.
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
# The headset view's relay (the dashboard's live view of what the presenter sees)
adb reverse tcp:3001 tcp:3001
echo "Headset linked over USB: it reaches this laptop at http://localhost:3000 (it moves to Wi-Fi by itself when it can)"
if command -v scrcpy >/dev/null 2>&1; then
  # Shows both eyes side by side. To show one eye, add --crop W:H:X:Y once tried on the headset.
  exec scrcpy --max-fps 60 --window-title "DryRun headset"
else
  echo "To mirror the headset on the big screen, install scrcpy (brew install scrcpy) and run this again."
fi
