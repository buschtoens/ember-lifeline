import EmberObject from '@ember/object';
import { debounce, cancel } from '@ember/runloop';
import { assert } from '@ember/debug';
import { registerDisposable } from './utils/disposable';
import { IMap } from './interfaces';

type PendingDebounce =
  | {
      debouncedTask: Function;
      cancelId: EmberRunTimer;
    }
  | undefined;

type PendingDebounces = Map<string | Function, PendingDebounce>;

/**
 * A map of instances/debounce functions that allows us to
 * store pending debounces per instance.
 *
 * @private
 *
 */
const registeredDebounces: IMap<Object, PendingDebounces> = new WeakMap<Object, any>();

/**
   Runs the function with the provided name after the timeout has expired on the last
   invocation. The timer is properly canceled if the object is destroyed before it is
   invoked.

   Example:

   ```js
   import Component from 'ember-component';
   import { debounceTask, runDisposables } from 'ember-lifeline';

   export default Component.extend({
     logMe() {
       console.log('This will only run once every 300ms.');
     },

     click() {
       debounceTask(this, 'logMe', 300);
     },

     willDestroy() {
       this._super(...arguments);

       runDisposables(this);
     }
   });
   ```

   @method debounceTask
   @param { Object } obj the instance to register the task for
   @param { String | Function } nameOrFunction the name of the task or a function to debounce
   @param { ...* } debounceArgs arguments to pass to the debounced method
   @param { Number } wait the amount of time to wait before calling the method (in milliseconds)
   @public
   */
export function debounceTask<O extends EmberObject>(
  obj: O,
  nameOrFunction: keyof O | ((...args: any[]) => any),
  ...debounceArgs: any[]
): void | undefined {
  assert(
    `Called \`debounceTask\` without a string or function as the first argument on ${obj}.`,
    typeof nameOrFunction === 'string' || typeof nameOrFunction === 'function'
  );
  assert(
    `Called \`obj.debounceTask('${nameOrFunction}', ...)\` where 'obj.${nameOrFunction}' is not a function.`,
    typeof nameOrFunction === 'function' || typeof obj[nameOrFunction] === 'function'
  );
  assert(
    `Called \`debounceTask\` on destroyed object: ${obj}.`,
    !obj.isDestroyed
  );

  let pendingDebounces: PendingDebounces = registeredDebounces.get(obj);
  if (!pendingDebounces) {
    pendingDebounces = new Map();
    registeredDebounces.set(obj, pendingDebounces);
    registerDisposable(obj, getDebouncesDisposable(pendingDebounces));
  }

  let pendingDebounce: PendingDebounce = pendingDebounces.get(nameOrFunction);
  let debouncedTask: Function;

  if (!pendingDebounce) {
    debouncedTask = (...args) => {
      delete pendingDebounces[name];
      if (typeof nameOrFunction === 'function') {
        nameOrFunction.apply(obj, args);
      } else {
        obj[nameOrFunction](...args);
      }
    };
  } else {
    debouncedTask = pendingDebounce.debouncedTask;
  }

  // cancelId is new, even if the debounced function was already present
  let cancelId = debounce(obj as any, debouncedTask as any, ...debounceArgs);

  pendingDebounces.set(nameOrFunction, { debouncedTask, cancelId });
}

/**
   Cancel a previously debounced task.

   Example:

   ```js
   import Component from 'ember-component';
   import { debounceTask, cancelDebounce } from 'ember-lifeline';

   export default Component.extend({
     logMe() {
       console.log('This will only run once every 300ms.');
     },

     click() {
       debounceTask(this, 'logMe', 300);
     },

     disable() {
        cancelDebounce(this, 'logMe');
     },

     willDestroy() {
       this._super(..arguments);
       runDisposables(this);
     }
   });
   ```

   @method cancelDebounce
   @param { Object } obj the instance to register the task for
   @param { String } methodName the name of the debounced method to cancel
   @public
   */
export function cancelDebounce(
  obj: EmberObject,
  nameOrFunction: string | (() => any)
): void | undefined {
  let pendingDebounces: PendingDebounces = registeredDebounces.get(obj);

  if (pendingDebounces === undefined || !pendingDebounces.has(nameOrFunction)) {
    return;
  }

  let { cancelId } = pendingDebounces.get(nameOrFunction);

  pendingDebounces.delete(nameOrFunction);
  cancel(cancelId);
}

function getDebouncesDisposable(debounces: PendingDebounces): Function {
  return function() {
    if (!debounces) {
      return;
    }

    for (const { cancelId } of debounces.values()) {
      cancel(cancelId);
    }
  };
}
