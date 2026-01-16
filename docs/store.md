# Store

Generic async Firestore service for persisting ActivityPub-style objects.

## Overview

The Store class provides a collection-agnostic interface for storing and retrieving objects in Firestore. Objects are treated as dicts with an `id` field. The storage location (collection path) is independent of the object's identity - an object can be stored in any collection regardless of what its `id` says.

## Core Concepts

### Object Identity vs Storage Location

An object's `id` is its identity. Where it lives in Firestore can be separate:

```python
# Object with ID pointing to one place
obj = {
    "id": "/users/abc123/notes/289hf",
    "type": "Note",
    "content": "..."
}

# Can usually be retrieved at it's canonical location:
await store.get("/users/abc123/notes/289hf")

# But this can be stored in a different collection because the system is denormalized
await store.add("/users/someoneelse/likes", obj)

# So it can be retrieved from that collection like this
await store.get("/users/someoneelse/likes", "/users/abc123/notes/289hf")
```

This enables:
- Linking objects into multiple collections
- Storing references to external objects
- Caching federated content locally

Caveat:
- It means the reference of an object can drift from the canonical value
- We solve this by "dereferncing" objects by often replacing references with a trip to get the canonical value and we keep this performant with caching

### Document ID Strategy

Firestore document IDs are determined by whether the object is at its canonical location:

**Canonical location** (object ID is a direct child of collection path):
- Use the last segment of the object's `id` as the document ID
- `/chats/abc123` stored in `/chats` → document ID `abc123`
- `/chats/abc/messages/msg1` stored in `/chats/abc/messages` → document ID `msg1`

**Non-canonical location** (object stored elsewhere):
- Hash the full object `id` to create the document ID
- `/chats/abc/messages/msg1` stored in `/users/bob/likes` → document ID `784cb1320e46fb7e`

This provides:
- Human-readable document IDs when browsing Firestore for canonical objects
- O(1) lookups by ID
- Idempotent upserts (same ID always maps to same document)
- Collision-free storage for non-canonical placements

## API

### `add(path: str, obj: dict) -> dict`

Add or update an object in a collection.

```python
message = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": "/chats/abc123/messages/msg001",
    "type": "Message",
    "content": "Hello, world",
    "published": "2025-01-15T10:00:00Z"
}

result = await store.add("/chats/abc123/messages", message)
```

- Normalizes the object before storage via `ld.normalize()`
- If an object with the same `id` exists, it is replaced
- Returns the stored object

### `get(id: str) -> dict | None`

Get an object by its full ID. The store searches for the document whose hashed ID matches.

```python
# Get by full ID - searches all collections
message = await store.get("/chats/abc123/messages/msg001")
```

### `get(path: str, id: str) -> dict | None`

Get an object from a specific collection by its ID. Use this when you know where the object is stored, especially when the storage location differs from the ID path.

```python
# Object ID is /users/abc/favorites/item1 but stored in /chats/xyz/attachments
obj = await store.get("/chats/xyz/attachments", "/users/abc/favorites/item1")

# Also works when ID matches storage path
message = await store.get("/chats/abc123/messages", "/chats/abc123/messages/msg001")
```

### `list(path: str, **filters) -> list[dict]`

List objects in a collection with optional filters.

```python
# All messages in a chat
messages = await store.list("/chats/abc123/messages")

# Filter by field
messages = await store.list(
    "/chats/abc123/messages",
    attributedTo="/users/xyz789"
)

# Order by field
messages = await store.list(
    "/chats/abc123/messages",
    order_by="published"
)
```

### `delete(id: str) -> None`

Delete an object by its full ID.

```python
await store.delete("/chats/abc123/messages/msg001")
```

### `delete(path: str, id: str) -> None`

Delete an object from a specific collection by its ID.

```python
# Delete object with ID /users/abc/item from collection /chats/xyz/attachments
await store.delete("/chats/xyz/attachments", "/users/abc/item")
```

## Normalization

Objects are normalized before storage using `core/ld.normalize()`. This ensures:
- Consistent field formats
- Proper JSON-LD structure
- `@context` is preserved explicitly

## Usage with Chat

```python
from datetime import datetime, timezone
from srv.services.store import Store

store = Store()

# Create a chat
chat = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": f"/chats/{nanoid()}",
    "type": "OrderedCollection",
    "name": "Chat with Sovereign",
    "attributedTo": "/users/anonymous",
    "published": datetime.now(timezone.utc).isoformat(),
    "totalItems": 0
}
await store.add("/chats", chat)

# Add a message
message = {
    "@context": "https://www.w3.org/ns/activitystreams",
    "id": f"{chat['id']}/messages/{nanoid()}",
    "type": "Message",
    "attributedTo": "/users/anonymous",
    "context": chat["id"],
    "content": "What is the meaning of life?",
    "published": datetime.utcnow().isoformat() + "Z"
}
await store.add(f"{chat['id']}/messages", message)

# Retrieve
messages = await store.list(f"{chat['id']}/messages", order_by="published")
```

## Firestore Structure

```
/{collection_path}/{hashed_document_id}
  - @context: string
  - id: string (original full ID)
  - type: string | list
  - ... other fields
```

The Firestore path is derived from the `add()` path argument. The document ID is a hash of the object's `id` field.
