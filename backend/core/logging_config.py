"""System/debug logging setup, kept deliberately separate from the audit
trail (core.audit_trail).

The audit trail is a business record: what the buyer agent, merchant agent,
policy guard, and Razorpay did, shown to end users in the live feed. This
module configures `structlog` for the *other* kind of log line — request
handling, external API calls, startup, and unexpected errors — the kind an
operator greps through, not a demo audience watches.
"""

import logging
import os
import sys

import structlog


def configure_logging() -> None:
    """Configure structlog + stdlib logging once, at process startup.

    In production (`ENVIRONMENT=production`) logs render as one JSON object
    per line, suitable for a log aggregator. Otherwise they render as
    human-readable, colored console output.
    """
    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    shared_processors: list[structlog.typing.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    renderer = (
        structlog.processors.JSONRenderer() if is_production else structlog.dev.ConsoleRenderer()
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level)

    # These libraries log at INFO by default and are noisy relative to how
    # useful their output is here; keep them at WARNING unless debugging.
    for noisy_logger in ("httpx", "httpcore", "uvicorn.access"):
        logging.getLogger(noisy_logger).setLevel("WARNING")


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound to `name` (conventionally `__name__`)."""
    return structlog.get_logger(name)
