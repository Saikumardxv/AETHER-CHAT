# Project Instructions

- After successful sign-in or registration, persist the authenticated user session reliably and allow the user to open direct conversations with another user and use channels without errors.
- Validate authentication, user persistence, channel creation, direct-message creation, message history, and authorization whenever those flows are changed.
- Check the configured database and its fallback persistence path before reporting auth or chat work as complete. Users, channels, and messages must remain available after a server restart when the fallback database is active.
- Send and receive messages through the fastest reliable realtime path available. Persist messages before broadcasting them, deliver them to every channel participant, avoid duplicates, and retain HTTP fallback behavior when realtime sockets are unavailable.
- Handle socket, API, database, and authorization failures with useful user-facing errors and without breaking the active conversation.
- Keep the entire chat interface responsive on mobile and desktop. Chat headers, message lists, composers, modals, navigation, and drawers must stay within the viewport without horizontal overflow.
- On mobile, keep the chat layout stable when an input or search field receives focus and the virtual keyboard opens. Use the visual viewport and safe-area insets so the page does not jump to the top or move the composer off-screen.
- Test mobile touch interactions, scrolling, search, message sending, direct chats, channels, and keyboard focus after responsive layout changes.
- When a user permanently deletes a message, remove it from the conversation immediately and do not display a deleted-message placeholder. Delete it permanently from the database and broadcast the removal to every participant.
