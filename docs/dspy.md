# DSPy Reference Guide

DSPy is a framework for building modular AI systems developed at Stanford NLP. The core philosophy: **"Programming—not prompting—LMs."** Instead of crafting brittle prompt strings, you write structured code that DSPy compiles into effective prompts.

## Installation

```bash
pip install -U dspy
```

## Quick Start

```python
import dspy

# Configure a language model
lm = dspy.LM('openai/gpt-4o-mini')  # or 'anthropic/claude-3-opus'
dspy.configure(lm=lm)

# Create a simple chain-of-thought module
qa = dspy.ChainOfThought('question -> answer')
result = qa(question="What is the capital of France?")
print(result.answer)
```

---

## Core Concepts

### 1. Language Models

DSPy supports many providers via LiteLLM:

```python
# OpenAI
lm = dspy.LM('openai/gpt-4o-mini', api_key='...')

# Anthropic
lm = dspy.LM('anthropic/claude-3-opus', api_key='...')

# Local (Ollama)
lm = dspy.LM('ollama/llama3.2')

# Configure globally
dspy.configure(lm=lm)

# Or use context for scoped changes (thread-safe)
with dspy.context(lm=other_lm):
    result = module(input="...")
```

**Configuration options:** `temperature`, `max_tokens`, `stop`, `cache` (enabled by default)

### 2. Signatures

Signatures define input/output behavior declaratively. DSPy handles prompt generation and parsing.

**Inline signatures** (simple tasks):

```python
# Basic
"question -> answer"

# With types
"question: str -> answer: str"

# Boolean output
"sentence -> sentiment: bool"

# Multiple fields
"context: list[str], question: str -> answer: str"

# With instructions
dspy.Signature("comment -> toxic: bool",
    instructions="Mark toxic if includes insults or harassment.")
```

**Class-based signatures** (complex tasks):

```python
from typing import Literal

class Emotion(dspy.Signature):
    """Classify the emotion in a sentence."""
    sentence: str = dspy.InputField()
    sentiment: Literal['sadness', 'joy', 'anger', 'fear'] = dspy.OutputField()

class CheckCitation(dspy.Signature):
    """Verify text is grounded in context."""
    context: str = dspy.InputField(desc="facts assumed true")
    text: str = dspy.InputField()
    faithfulness: bool = dspy.OutputField()
    evidence: dict[str, list[str]] = dspy.OutputField(desc="supporting quotes")
```

**Supported types:** `str`, `int`, `bool`, `float`, `list[...]`, `dict[...]`, `Optional[...]`, `Literal[...]`, `dspy.Image`, Pydantic models

### 3. Modules

Modules are building blocks that abstract prompting techniques. They have learnable parameters (instructions, demonstrations).

**Built-in modules:**

| Module | Purpose |
|--------|---------|
| `dspy.Predict` | Basic prediction |
| `dspy.ChainOfThought` | Step-by-step reasoning before answering |
| `dspy.ProgramOfThought` | Generate code to compute answers |
| `dspy.ReAct` | Agent with tool usage |
| `dspy.MultiChainComparison` | Compare multiple reasoning chains |

**Using modules:**

```python
# Declare with signature
classify = dspy.Predict('text -> label')
reason = dspy.ChainOfThought('question -> answer')

# Invoke with inputs
result = classify(text="I love this product!")
print(result.label)

# Access reasoning (ChainOfThought)
result = reason(question="Why is the sky blue?")
print(result.reasoning)  # step-by-step thinking
print(result.answer)
```

**Custom modules:**

```python
class MultiHopQA(dspy.Module):
    def __init__(self, num_hops=3):
        self.num_hops = num_hops
        self.generate_query = dspy.ChainOfThought("context, question -> query")
        self.generate_answer = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        context = []
        for _ in range(self.num_hops):
            query = self.generate_query(context=context, question=question).query
            context.extend(retrieve(query))  # your retrieval function
        return self.generate_answer(context=context, question=question)
```

---

## Building Agents

### Tools

Define tools as Python functions with clear docstrings and type hints:

```python
def get_weather(city: str, units: str = "celsius") -> str:
    """Get current weather for a city.

    Args:
        city: Name of the city
        units: Temperature units (celsius or fahrenheit)
    """
    # Implementation
    return f"Weather in {city}: 22 degrees {units}"

def search_database(query: str, limit: int = 10) -> list[dict]:
    """Search the knowledge base.

    Args:
        query: Search query string
        limit: Maximum results to return
    """
    # Implementation
    return [{"title": "Result", "content": "..."}]
```

**Wrap as DSPy tools:**

```python
weather_tool = dspy.Tool(get_weather)
search_tool = dspy.Tool(search_database)

# Access metadata
print(weather_tool.name)  # "get_weather"
print(weather_tool.desc)  # docstring
print(weather_tool.args)  # parameter info
```

### ReAct Agent

ReAct (Reasoning and Acting) enables agents to reason about situations and decide when to use tools:

```python
def calculator(expression: str) -> float:
    """Evaluate a mathematical expression."""
    return eval(expression)

def search(query: str) -> str:
    """Search for information."""
    return "Paris is the capital of France."

# Create agent
agent = dspy.ReAct(
    signature="question -> answer",
    tools=[calculator, search],
    max_iters=10  # maximum reasoning steps
)

# Run agent
result = agent(question="What is the population of the capital of France?")
print(result.answer)
print(result.trajectory)  # reasoning and action history
```

**ReAct parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `signature` | `Signature` | required | Input/output specification |
| `tools` | `list[Callable]` | required | Available tools |
| `max_iters` | `int` | 10 | Max reasoning iterations |

The agent automatically:
- Converts functions to Tool objects
- Adds a "finish" tool to complete tasks
- Handles errors gracefully
- Truncates trajectory if context limit exceeded

---

## Evaluation

### Data Collection

Build datasets with inputs and expected outputs:

```python
# Minimum: 20 examples, ideal: 200+
trainset = [
    dspy.Example(question="What is 2+2?", answer="4"),
    dspy.Example(question="Capital of Japan?", answer="Tokyo"),
    # ...
]
```

### Metrics

Define how to score outputs:

```python
# Simple accuracy
def exact_match(example, prediction, trace=None):
    return example.answer.lower() == prediction.answer.lower()

# LM-based metric (for complex evaluation)
class AnswerQuality(dspy.Signature):
    """Judge if the answer is correct and complete."""
    question: str = dspy.InputField()
    gold_answer: str = dspy.InputField()
    predicted: str = dspy.InputField()
    score: float = dspy.OutputField()

judge = dspy.ChainOfThought(AnswerQuality)

def quality_metric(example, prediction, trace=None):
    result = judge(
        question=example.question,
        gold_answer=example.answer,
        predicted=prediction.answer
    )
    return result.score
```

### Running Evaluation

```python
from dspy.evaluate import Evaluate

evaluator = Evaluate(devset=devset, metric=exact_match, num_threads=4)
score = evaluator(my_program)
print(f"Accuracy: {score}%")
```

---

## Optimization

Optimizers automatically tune prompts and demonstrations based on your metrics.

### Data Split

For prompt optimizers, use **reverse allocation**:
- 20% training, 80% validation (prevents overfitting)

### Available Optimizers

| Optimizer | Use Case |
|-----------|----------|
| `BootstrapFewShot` | Basic few-shot learning |
| `BootstrapFewShotWithRandomSearch` | Few-shot with exploration |
| `MIPROv2` | Joint instruction + example optimization |
| `COPRO` | Instruction optimization |
| `GEPA` | Advanced reflective evolution |

### Using MIPROv2

```python
from dspy.teleprompt import MIPROv2

optimizer = MIPROv2(
    metric=exact_match,
    auto="medium",  # "light", "medium", or "heavy"
    num_trials=30,
)

optimized_program = optimizer.compile(
    student=my_program,
    trainset=trainset,
)

# Save optimized program
optimized_program.save("optimized_qa.json")

# Load later
loaded = MyProgram()
loaded.load("optimized_qa.json")
```

**MIPROv2 process:**
1. Bootstrap examples from training data
2. Generate instruction candidates
3. Bayesian search over combinations
4. Return best-performing configuration

### Basic Bootstrap

```python
from dspy.teleprompt import BootstrapFewShot

optimizer = BootstrapFewShot(metric=exact_match, max_bootstrapped_demos=4)
optimized = optimizer.compile(student=my_program, trainset=trainset)
```

---

## Common Patterns

### RAG (Retrieval-Augmented Generation)

```python
class RAG(dspy.Module):
    def __init__(self, num_docs=3):
        self.num_docs = num_docs
        self.retrieve = your_retriever  # e.g., ChromaDB, Pinecone
        self.generate = dspy.ChainOfThought("context, question -> answer")

    def forward(self, question):
        docs = self.retrieve(question, k=self.num_docs)
        context = "\n".join(docs)
        return self.generate(context=context, question=question)
```

### Classification

```python
class Classifier(dspy.Signature):
    """Classify text into categories."""
    text: str = dspy.InputField()
    category: Literal['tech', 'sports', 'politics', 'other'] = dspy.OutputField()

classify = dspy.Predict(Classifier)
result = classify(text="The new iPhone was announced today")
print(result.category)  # "tech"
```

### Multi-Step Agent

```python
class ResearchAgent(dspy.Module):
    def __init__(self, tools):
        self.planner = dspy.ChainOfThought("question -> plan: list[str]")
        self.executor = dspy.ReAct("question, plan -> answer", tools=tools)

    def forward(self, question):
        plan = self.planner(question=question)
        return self.executor(question=question, plan=plan.plan)
```

---

## Best Practices

1. **Start simple** - Begin with `dspy.Predict` or `dspy.ChainOfThought`, add complexity based on results

2. **Use descriptive field names** - Signatures work better with semantic names (`customer_query` vs `input`)

3. **Write clear tool docstrings** - Agents rely on descriptions to choose tools

4. **Iterate on metrics** - Your evaluation metric drives optimization; refine it based on failure cases

5. **Test with powerful models first** - Use GPT-4 or Claude to understand what's achievable, then optimize for smaller models

6. **Track usage** - Enable with `dspy.configure(track_usage=True)`

---

## Troubleshooting & Further Reading

### Common Issues

| Problem | Solution | Documentation |
|---------|----------|---------------|
| Model not responding | Check API key and model name format (`provider/model`) | [Language Models](https://dspy.ai/learn/programming/language_models/) |
| Output parsing errors | Use class-based signatures with explicit types | [Signatures](https://dspy.ai/learn/programming/signatures/) |
| Agent stuck in loop | Reduce `max_iters`, improve tool docstrings | [Tools](https://dspy.ai/learn/programming/tools/) |
| Poor optimization results | Increase training data, refine metric | [Optimization Overview](https://dspy.ai/learn/optimization/overview/) |
| Context window exceeded | Use trajectory truncation, reduce `max_iters` | [ReAct API](https://dspy.ai/api/modules/ReAct/) |
| Inconsistent outputs | Lower temperature, enable caching | [Language Models](https://dspy.ai/learn/programming/language_models/) |

### Tutorials by Topic

**Getting Started:**
- [Building RAG Systems](https://dspy.ai/tutorials/rag/) - Retrieval-augmented generation from scratch
- [Classification](https://dspy.ai/tutorials/classification/) - Text classification patterns

**Agents & Tools:**
- [Building AI Agents](https://dspy.ai/tutorials/agents/) - Agent fundamentals with ReAct
- [Advanced Tool Use](https://dspy.ai/tutorials/tool_use/) - Optimizing tool-using agents
- [Finetuning Agents](https://dspy.ai/tutorials/agent_finetuning/) - Training agents for better performance
- [MCP Integration](https://dspy.ai/learn/programming/mcp/) - Model Context Protocol for tool servers

**Advanced Retrieval:**
- [Multi-Hop RAG](https://dspy.ai/tutorials/multihop/) - Complex multi-step retrieval

**Optimization Deep Dives:**
- [MIPROv2](https://dspy.ai/api/optimizers/MIPROv2/) - Joint instruction and example optimization
- [GEPA](https://dspy.ai/tutorials/gepa/) - Reflective prompt evolution
- [BootstrapFewShot](https://dspy.ai/api/optimizers/BootstrapFewShot/) - Basic few-shot optimization

**Production:**
- [Saving & Loading](https://dspy.ai/tutorials/saving/) - Persist optimized programs
- [Deployment](https://dspy.ai/tutorials/deployment/) - Production deployment strategies
- [Debugging](https://dspy.ai/tutorials/debugging/) - Troubleshooting DSPy programs
- [Streaming](https://dspy.ai/tutorials/streaming/) - Stream responses in real-time
- [Async Operations](https://dspy.ai/tutorials/async/) - Concurrent execution patterns

### API Reference

- [Modules](https://dspy.ai/api/modules/) - All built-in modules (`Predict`, `ChainOfThought`, `ReAct`, etc.)
- [Optimizers](https://dspy.ai/api/optimizers/) - All optimization algorithms
- [Adapters](https://dspy.ai/api/adapters/) - Customizing prompt formatting
- [Evaluation](https://dspy.ai/api/evaluation/) - Evaluation utilities

---

## Resources

- **Documentation:** https://dspy.ai
- **GitHub:** https://github.com/stanfordnlp/dspy
- **Discord:** https://discord.gg/XCGy2WDCQB
