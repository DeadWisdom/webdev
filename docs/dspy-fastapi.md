# DSPy + FastAPI Streaming Guide

This guide covers integrating DSPy with FastAPI for streaming responses. Requires **DSPy 2.6.0+**.

## Installation

```bash
pip install -U dspy fastapi uvicorn
```

---

## Basic FastAPI Setup (Non-Streaming)

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import dspy

app = FastAPI()

class Question(BaseModel):
    text: str

lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm, async_max_workers=4)

# Wrap program for async operation
dspy_program = dspy.asyncify(dspy.ChainOfThought("question -> answer"))

@app.post("/predict")
async def predict(question: Question):
    try:
        result = await dspy_program(question=question.text)
        return {"status": "success", "data": result.toDict()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Streaming with Server-Sent Events (SSE)

### Simple Streaming Endpoint

```python
from fastapi.responses import StreamingResponse
from dspy.utils.streaming import streaming_response

dspy_program = dspy.asyncify(dspy.ChainOfThought("question -> answer"))
streaming_program = dspy.streamify(dspy_program)

@app.post("/predict/stream")
async def stream(question: Question):
    stream = streaming_program(question=question.text)
    return StreamingResponse(
        streaming_response(stream),
        media_type="text/event-stream"
    )
```

### Custom SSE with Token Streaming

```python
import json

@app.post("/v1/query")
async def query_stream(question: Question):
    async def generate():
        async for item in streaming_program(question=question.text):
            if isinstance(item, dspy.streaming.StreamResponse):
                yield f"data: {json.dumps({'type': 'token', 'chunk': item.chunk})}\n\n"
            elif isinstance(item, dspy.streaming.StatusMessage):
                yield f"data: {json.dumps({'type': 'status', 'msg': item.message})}\n\n"
            elif isinstance(item, dspy.Prediction):
                yield f"data: {json.dumps({'type': 'result', 'answer': item.answer})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## Token Streaming with StreamListeners

To stream specific output fields as tokens are generated:

```python
import dspy

predict = dspy.Predict("question -> answer")

# Configure which fields to stream
stream_predict = dspy.streamify(
    predict,
    stream_listeners=[
        dspy.streaming.StreamListener(signature_field_name="answer")
    ]
)

# FastAPI endpoint
@app.post("/stream-tokens")
async def stream_tokens(question: Question):
    async def generate():
        async for chunk in stream_predict(question=question.text):
            if isinstance(chunk, dspy.streaming.StreamResponse):
                # StreamResponse has: predict_name, signature_field_name, chunk
                yield f"data: {json.dumps({'field': chunk.signature_field_name, 'token': chunk.chunk})}\n\n"
            elif isinstance(chunk, dspy.Prediction):
                yield f"data: {json.dumps({'type': 'done', 'answer': chunk.answer})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

### Streaming Multiple Fields

For agents that reuse fields (e.g., `dspy.ReAct` loops):

```python
stream_listeners = [
    dspy.streaming.StreamListener(
        signature_field_name="next_thought",
        allow_reuse=True  # Required for repeated field access
    )
]
```

For duplicate field names across modules:

```python
dspy.streaming.StreamListener(
    signature_field_name="answer",
    predict=module.predict1,
    predict_name="predict1"
)
```

---

## Status Message Streaming

Provide real-time status updates during agent execution:

```python
class MyStatusProvider(dspy.streaming.StatusMessageProvider):
    def tool_start_status_message(self, instance, inputs):
        return f"Calling {instance.name}..."

    def tool_end_status_message(self, outputs):
        return f"Done: {str(outputs)[:50]}"

    def lm_start_status_message(self, instance, inputs):
        return "Thinking..."

    def lm_end_status_message(self, outputs):
        return None  # Return None to skip message

    def module_start_status_message(self, instance, inputs):
        return f"Running {instance.__class__.__name__}..."

    def module_end_status_message(self, outputs):
        return None
```

Apply to a ReAct agent:

```python
react = dspy.ReAct("question -> answer", tools=[search, calculate])

streaming_agent = dspy.streamify(
    react,
    status_message_provider=MyStatusProvider(),
)

@app.post("/agent/stream")
async def agent_stream(question: Question):
    async def generate():
        async for item in streaming_agent(question=question.text):
            if isinstance(item, dspy.streaming.StatusMessage):
                yield f"data: {json.dumps({'type': 'status', 'msg': item.message})}\n\n"
            elif isinstance(item, dspy.Prediction):
                yield f"data: {json.dumps({'type': 'result', 'answer': item.answer})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## Combined Token + Status Streaming

Full example with both token streaming and status messages:

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import dspy
import json

app = FastAPI()

class Query(BaseModel):
    question: str

# Status provider for agent visibility
class AgentStatusProvider(dspy.streaming.StatusMessageProvider):
    def tool_start_status_message(self, instance, inputs):
        return f"Using tool: {instance.name}"

    def tool_end_status_message(self, outputs):
        return f"Tool complete"

    def lm_start_status_message(self, instance, inputs):
        return "Generating response..."

# Configure agent with streaming
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"

react = dspy.ReAct("question -> answer", tools=[search])

streaming_agent = dspy.streamify(
    react,
    status_message_provider=AgentStatusProvider(),
    stream_listeners=[
        dspy.streaming.StreamListener(
            signature_field_name="next_thought",
            allow_reuse=True
        )
    ]
)

@app.post("/chat/stream")
async def chat_stream(query: Query):
    async def generate():
        async for item in streaming_agent(question=query.question):
            if isinstance(item, dspy.streaming.StatusMessage):
                yield f"data: {json.dumps({'type': 'status', 'message': item.message})}\n\n"
            elif isinstance(item, dspy.streaming.StreamResponse):
                yield f"data: {json.dumps({'type': 'token', 'field': item.signature_field_name, 'chunk': item.chunk})}\n\n"
            elif isinstance(item, dspy.Prediction):
                yield f"data: {json.dumps({'type': 'complete', 'answer': item.answer})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
```

---

## Synchronous Streaming (Non-Async)

For synchronous contexts:

```python
stream_predict = dspy.streamify(
    predict,
    stream_listeners=[dspy.streaming.StreamListener(signature_field_name="answer")],
    async_streaming=False
)

for chunk in stream_predict(question="..."):
    if isinstance(chunk, dspy.streaming.StreamResponse):
        print(chunk.chunk, end="")
```

---

## streamify API Reference

```python
dspy.streamify(
    program,                                    # DSPy module to wrap
    status_message_provider=None,               # StatusMessageProvider subclass
    stream_listeners=None,                      # list[StreamListener]
    include_final_prediction_in_output_stream=True,
    is_async_program=False,                     # True if already asyncified
    async_streaming=True                        # False for sync generator
)
```

**Returns:** Async generator yielding:
- `StreamResponse` - Token chunks (with `predict_name`, `signature_field_name`, `chunk`)
- `StatusMessage` - Progress updates (with `message`)
- `Prediction` - Final result

---

## Running the Server

```bash
export OPENAI_API_KEY="your-key"
uvicorn app:app --reload
```

---

## Sources

- [DSPy Streaming Tutorial](https://dspy.ai/tutorials/streaming/)
- [DSPy Deployment Guide](https://dspy.ai/tutorials/deployment/)
- [streamify API Reference](https://dspy.ai/api/utils/streamify/)
- [DSPy Status Streaming (Elicited)](https://www.elicited.blog/posts/dspy-status-streaming)
