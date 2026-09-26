import { api, ApiError, tokenDigits } from '@/lib/api';

const conn = { url: 'http://10.0.2.2:8000/', token: 'secret' };

function reply(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  );
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

it('looks a tracking number up by its digits, with the bearer token', async () => {
  fetchMock.mockReturnValue(reply(200, { reference: 'APP-2026-0001', stage: 'received' }));
  const status = await api.track(conn, '1234-5678');
  expect(status.stage).toBe('received');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://10.0.2.2:8000/helpline/track/12345678');
  expect(init.method).toBe('GET');
  expect(init.headers.Authorization).toBe('Bearer secret');
});

it('posts a new application as JSON', async () => {
  fetchMock.mockReturnValue(reply(201, { id: 'APP-2026-0002', trackingToken: '1111-2222' }));
  await api.fileCase({ url: 'http://x' }, { narrative: 'something happened' } as never);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://x/intake/web');
  expect(init.method).toBe('POST');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.headers.Authorization).toBeUndefined();
  expect(JSON.parse(init.body)).toEqual({ narrative: 'something happened' });
});

it("turns the server's detail into the error message", async () => {
  fetchMock.mockReturnValue(reply(404, { detail: 'No case with that tracking number' }));
  await expect(api.track(conn, '00000000')).rejects.toMatchObject({
    status: 404,
    message: 'No case with that tracking number',
    offline: false,
  });
});

it('reads FastAPI validation errors', async () => {
  fetchMock.mockReturnValue(
    reply(422, { detail: [{ loc: ['body', 'applicant', 'phone'], msg: 'not a Bangladeshi mobile number' }] })
  );
  await expect(api.fileCase(conn, {} as never)).rejects.toMatchObject({
    status: 422,
    message: 'applicant.phone: not a Bangladeshi mobile number',
  });
});

it('reports an unreachable server as offline', async () => {
  fetchMock.mockReturnValue(Promise.reject(new TypeError('Network request failed')));
  const error = await api.health(conn).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).offline).toBe(true);
});

it('uploads a document as multipart form data to the case reference', async () => {
  fetchMock.mockReturnValue(reply(201, { document: { id: 1 }, checklist: [], missing: [] }));
  await api.uploadDocument(conn, 'APP-2026-0001', { uri: 'file:///nid.jpg', name: 'nid.jpg', mimeType: 'image/jpeg' }, 'nid_copy');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('http://10.0.2.2:8000/intake/cases/APP-2026-0001/documents');
  expect(init.method).toBe('POST');
  expect(init.body).toBeInstanceOf(FormData);
  expect(init.headers['Content-Type']).toBeUndefined(); // fetch sets the multipart boundary
});

it('keeps only the digits of a number', () => {
  expect(tokenDigits(' 1234-5678 ')).toBe('12345678');
});
