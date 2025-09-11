curl-mcp body='{}':
    curl -X POST \
        -H 'accept: application/json,text/event-stream' \
        -H 'content-type: application/json' \
        -d '{{body}}' \
        http://localhost:5173/tidewave/mcp

initialize-mcp:
    @just curl-mcp '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","clientInfo":{"name":"curl-test","version":"1.0.0"},"capabilities":{}},"id":1}'

list-tools-mcp:
    @just curl-mcp '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'

curl-shell command:
    curl -X POST http://localhost:5173/tidewave/shell \
        -H 'content-type: application/json' \
        -H 'accept: text/event-stream,application/json' \
        -d '{"command": "{{command}}"}' \
        --output -

default:
    @just --choose
