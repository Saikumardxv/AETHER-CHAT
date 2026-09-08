# AETHER-CHAT
Real time chat with collaboration

## MongoDB Atlas setup

1. In MongoDB Atlas, open the project and go to **Database Access**.
2. Create a new database user with a strong, unique password. Use the minimum required role, such as **Read and write to any database** for this application.
3. In **Network Access**, allow the server's IP address. For temporary local testing, Atlas also supports `0.0.0.0/0`, but it is not recommended for production.
4. Copy the driver connection string and place it in `server/.env` as `MONGODB_URI`. Replace the placeholders with the new user's values and URL-encode special characters in the password.
5. Set a long random `JWT_SECRET` in the same file. `server/.env` is ignored by Git and must never be committed.
6. If Node reports `querySrv ECONNREFUSED`, add `MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1` to `server/.env` and restart the server.

Use `server/.env.example` as the starting template. After configuration, start the backend with `npm start` from the `server` directory and confirm the log reports `MongoDB Connected`.
