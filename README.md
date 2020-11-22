# multijson
 Parse multiple sequential JSON objects out of a stream.

The module exports a single class:

```ts
class MultiJSON {
    parse(chunk: string, cb?: (json: unknown) => void): unknown[];
    end(cb?: (json: unknown) => void): unknown[];
}
```

The `parse` method takes in a string which should be a fragment of a valid JSON object or a series of adjacent JSON objects.
If a callback function is provided, it will be called sychronously once for each complete object that can be deserialized from the input chunks, and `parse` will return an empty array. If no callback is provided, as many complete objects as possible will be collected from the input and returned in an array. Incomplete objects are preserved across calls; multiple subsequent calls to `parse` with object fragments will continue to build up the in-progress object until it is complete, after which it will be exposed (either by being passed to the callback or in the return array) in full. The `parse` method will throw an error with an informative message if it encounters invalid JSON.

The `end` method forces the MultiJSON object to treat any in-progress object as complete and return it. If a callback is provided, the result object will be both synchronously passed to said callback and returned as the last element of an array. If there is no in-progress object, the callback will not be called. This resets the MultiJSON object to start parsing at the beginning of a new data stream.

If `parse` throws an error, `end` may be subsequently called to retrieve any remaining cached objects, as well as the partial value that was being parsed when the error was encountered (if there was any).

In addition to standard JSON, this parser also supports parsing BigInt values with the ES6 BigInt literal syntax.