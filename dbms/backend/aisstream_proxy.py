import asyncio
import json
import os
import websockets
from dotenv import load_dotenv

load_dotenv()

AISSTREAM_KEY = os.environ.get('AISSTREAM_KEY', '')
AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream'
PROXY_PORT    = 8765
BOUNDING_BOX  = [[0.0, 68.0], [30.0, 110.0]]

if not AISSTREAM_KEY:
    print('[Proxy] ERROR: AISSTREAM_KEY not found in .env')
    exit(1)

async def handle_client(client_ws):
    print('[Proxy] Browser client connected')
    try:
        async with websockets.connect(AISSTREAM_URL) as ais_ws:
            await ais_ws.send(json.dumps({
                'APIKey': AISSTREAM_KEY,
                'BoundingBoxes': [BOUNDING_BOX],
                'FilterMessageTypes': ['PositionReport', 'ShipStaticData'],
            }))
            print('[Proxy] Subscribed to aisstream.io — streaming vessel data')
            try:
                async for message in ais_ws:
                    try:
                        await client_ws.send(message)
                    except websockets.exceptions.ConnectionClosed:
                        print('[Proxy] Browser disconnected')
                        break
            except websockets.exceptions.ConnectionClosedError:
                print('[Proxy] Connection closed cleanly')
            except Exception as e:
                print(f'[Proxy] Stream ended: {e}')
    except websockets.exceptions.RejectHandshake as e:
        print(f'[Proxy] aisstream rejected connection: {e}')
    except Exception as e:
        if 'rejected' in str(e).lower() or '401' in str(e) or '403' in str(e):
            print(f'[Proxy] aisstream rejected connection: {e}')
        else:
            print(f'[Proxy] Error: {e}')

async def main():
    print(f'[Proxy] Starting WebSocket proxy on ws://localhost:{PROXY_PORT}')
    async with websockets.serve(handle_client, 'localhost', PROXY_PORT):
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())
