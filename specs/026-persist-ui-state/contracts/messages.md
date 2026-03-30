# Message Contracts: Persist UI State

## New Message Types

### Response: `persistedUIState` (Extension Host → Webview)

Sent once during webview initialization as part of the initial data payload.

```typescript
{
  type: 'persistedUIState';
  payload: {
    uiState: PersistedUIState;
  };
}
```

### Request: `updatePersistedUIState` (Webview → Extension Host)

Sent when the user changes any persisted UI preference. Payload contains only the changed fields (partial update).

```typescript
{
  type: 'updatePersistedUIState';
  payload: {
    uiState: Partial<Omit<PersistedUIState, 'version'>>;
  };
}
```

## Integration with Existing Message System

- Add `'persistedUIState'` to the `ResponseMessage` union in `shared/messages.ts`.
- Add `'updatePersistedUIState'` to the `RequestMessage` union in `shared/messages.ts`.
- Add corresponding entries to `RESPONSE_TYPES` and `REQUEST_TYPES` enums.
- Add type guard support.
