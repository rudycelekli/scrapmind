# Security and privacy

The alpha operates locally. The API listens on loopback and accepts explicit JSON requests from its own origin or CLI clients. It is not designed to be exposed as an unauthenticated public service.

Inventory remains local during deterministic planning. Explicit invention requests send the supplied inventory and optional image to the configured provider. A remote provider may retain that information according to its policies. Keys belong in the ignored `.env` file, never in client code or exported workspaces.

Models return data, never executable commands. Input validation constrains syntax, quantities, and references; it cannot establish physical correctness or prevent every inappropriate suggestion. The alpha does not actuate physical devices.

Report vulnerabilities through GitHub's private vulnerability reporting when available. If unavailable, open an issue requesting a private reporting channel without including exploit details, private captures, or credentials.
