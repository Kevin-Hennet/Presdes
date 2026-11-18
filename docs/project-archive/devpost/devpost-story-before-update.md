## Inspiration

Medication labels put important information in small print, often using terminology that is difficult to understand. For someone with a visual impairment or reading difficulty, even finding the instructions can be frustrating. We wanted to make that information easier to access with something people already carry: their phone. That idea became PresDes, short for Prescription Description.

## What it does

PresDes is an accessibility-focused medication information project. The core experience is designed to let users photograph or upload a medication label and view its information in a clearer, more readable format.

Our MVP focuses on extracting medication names, printed directions, warnings, and expiration dates when they are visible; separating original label wording from plain-language explanations; and providing read-aloud controls. The interface prioritizes readable text, clear navigation, and large touch targets on mobile devices. Missing or unreadable information should be identified rather than guessed.

PresDes is an informational accessibility tool, not a diagnosis or treatment system. Medication decisions should be checked with a pharmacist or healthcare professional. Drug-interaction lookup is a future goal, not a completed MVP feature.

## How we built it

Our current stack combines a React frontend with a Python FastAPI backend.

- **Frontend:** React, Tailwind CSS, shadcn/ui, and Framer Motion, with an installable progressive web app experience.
- **Backend:** Python and FastAPI for image-processing requests and application logic.
- **AI:** Gemini API for vision and text processing, using structured JSON output to organize extracted label information and explanations.
- **Data:** MongoDB Atlas.
- **Speech:** The browser's Web Speech API for read-aloud functionality.
- **Hosting:** A Vultr virtual machine with Caddy and a GoDaddy domain.
- **Development tooling:** Cursor.

The intended processing flow is straightforward: capture or upload a label, send the image to the backend, request structured information from Gemini, and present the result in an accessible interface. Structured JSON helps organize the response, but does not by itself verify the accuracy of the extracted text.

openFDA drug-label grounding and Tesseract OCR with word-level bounding boxes remain stretch integrations.

## Challenges we ran into

A central design challenge is simplifying medication information without changing its meaning. An explanation needs to remain distinct from the original label, especially when it includes dosage instructions or warnings. Another challenge is handling incomplete or hard-to-read images without filling in missing details.

Accessibility also affects the whole experience, from framing a label in the camera to navigating the results and listening to instructions. We are prioritizing a focused scan-and-explain workflow before adding more complex features such as interaction lookups or hands-free capture.

## Accomplishments that we're proud of

We are proud of shaping PresDes around a specific accessibility problem and keeping that goal central to the product. Our approach combines a mobile-first interface, structured label information, and audio access in one focused experience. We have also defined clear boundaries between extracted text, AI explanations, and future features, so the project does not promise more than it can support.

## What we learned

Designing PresDes has reinforced that accessibility is about the entire user journey, not just larger text. Clear navigation, understandable errors, and audio controls all matter. We also learned that organizing an AI response is different from verifying it: a well-formed answer can still contain an incorrect reading. That distinction shapes how we approach uncertainty and preserve the original label wording.

## What's next for PresDes

Our immediate priority is completing and testing the core scan, explain, and read-aloud experience on real phones using fictional sample labels. Next, we want to improve screen-reader navigation and gather feedback from people who would benefit from more accessible medication information.

Future goals include source-backed drug-label information through openFDA, evaluating reliable sources for potential interaction information, Tesseract-based label highlighting, multilingual explanations, improved expiration tracking, and hands-free capture. These are planned extensions, not claims about completed functionality.
