# PresDes fictional-label demo

Use [Pine Sample 5 mg](../frontend/public/fictional-label.png), a clearly marked training label. Print it or display it on a second screen, and keep a JPG or PNG copy on the demo device.

## Live path

1. Open PresDes and select **Open camera**. Frame part of the training label and tap the shutter. Rotate the same bottle, keep some of the previous text in view, and capture the rest. Tap a thumbnail to review, remove, or retake that view. Tap **Done** to return to the photo review and analyze the selected views. A flat label that fits the frame can be scanned with one photo.
2. Select an explanation language and tap **Analyze label**. Choose **View source photos** below the heading to inspect the originals. Compare the extracted directions, printed warning, and **Discard after NOV 30 2027.** against the photos. Each full-size link opens in a new tab.
3. Switch the reading level, then select **Listen** beside Directions or the explanation. Open **Display** and enable **Large text** and **High contrast**.
4. Select **Save text to MongoDB** and wait for confirmation. Open **Saved scans → MongoDB**, reopen the entry, then return to the list and delete it. **This browser** shows browser-local saves.
5. If time permits, photograph the same training label with a portion obscured and show the uncertainty or retake path. Listen to **What may be unclear** and any unclear section. The section audio announces its status before reading available wording. Live extraction and model decisions can vary across requests.

## MongoDB demo with the prepared result

Start PresDes with `.\scripts\start.ps1` and connect MongoDB through the masked setup prompt in the README. Open **Try fictional example**, expand **View source photo**, and select **Save text to MongoDB**. Reopen the saved result under **Saved scans → MongoDB**. It retains the prepared-example label and the text, including both reading levels. Delete the entry to show that the database-backed list updates. This path uses a real database when configured and a prepared result for the label.

## Fallback

- If camera permission is blocked, use **Choose photos** with the saved training label or **Use device camera** when the device offers the native picker.
- If the AI provider is unavailable, return to Scan and choose **Try fictional example**. Tell the audience they are seeing a prepared result. It includes the same label, extracted wording, two explanation levels, display settings, and browser speech.
- If the demo depends on a network connection, open the prepared result in a second tab beforehand so it is ready if the connection drops.

## Physical-phone rehearsal pending

- Open a trusted HTTPS URL in the actual browser, then mirror it to the presentation computer.
- Verify camera permissions, rear-camera preview, and successive captures in both orientations. Check that the bottom thumbnails stay visible, the saved frame matches the preview, and **Done** keeps the photos. Repeat after denying camera access and use the photo picker.
- Analyze the training label using the configured demo account. Compare each number, unit, and date against the printout. Open the source photo and test with glare or a cropped edge as well.
- Increase text size, rotate the device, and check that controls and the label remain readable. Test VoiceOver or TalkBack focus and announcements on the device.
- Play an extracted section and an explanation through the presentation audio, then navigate away and check that playback stops. Open the prepared result in a second tab and verify it remains readable after disconnecting.
