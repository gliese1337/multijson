# multijson
 Parse multiple sequential JSON objects out of a stream.

The module exports a single class:

```ts
class MultiJSON {
    parse(chunk: string, cb?: (json: unknown) => void): unknown[];
    end(cb?: (json: unknown) => void): unknown;
}
```

The `parse` method takes in a string which should be a fragment of a valid JSON object or a series of adjacent JSON objects.
If a callback function is provided, it will be called sychronously once for each complete object that can be deserialized from the input chunks, and `parse` will return an empty array. If no callback is provided, as many complete objects as possible will be collected from the input and returned in an array. Incomplete objects are preserved across calls; multiple subsequent calls to `parse` with object fragments will continue to build up the in-progress object until it is complete, after which it will be exposed (eithe by being passed to the callback or in the return array) in full.

The `end` method forces the MultiJSON object to treat any in-progress object as complete and return it. If a callback is provided, the result object will be both synchronously passed to said callback and returned. If there is no in-progress object, the callback will not be called, and `end` will return undefined. This resets the MultiJSON object to start parsing at the beginning of a new data stream.