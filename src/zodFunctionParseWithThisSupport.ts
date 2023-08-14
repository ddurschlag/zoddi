import z from 'zod';

export function zodFunctionParseWithThisSupport(this: z.ZodFunction<any, any>, input: z.ParseInput): z.ParseReturnType<any> {
	const { ctx } = this._processInputParams(input);
	if (ctx.parsedType !== z.ZodParsedType.function) {
	  z.addIssueToContext(ctx, {
	    code: z.ZodIssueCode.invalid_type,
	    expected: z.ZodParsedType.function,
	    received: ctx.parsedType,
	  });
	  return z.INVALID;
	}
    
	function makeArgsIssue(args: any, error: z.ZodError): z.ZodIssue {
	  return z.makeIssue({
	    data: args,
	    path: ctx.path,
	    errorMaps: [
	      ctx.common.contextualErrorMap,
	      ctx.schemaErrorMap,
	      z.getErrorMap(),
	      z.defaultErrorMap,
	    ].filter((x) => !!x) as z.ZodErrorMap[],
	    issueData: {
	      code: z.ZodIssueCode.invalid_arguments,
	      argumentsError: error,
	    },
	  });
	}
    
	function makeReturnsIssue(returns: any, error: z.ZodError): z.ZodIssue {
	  return z.makeIssue({
	    data: returns,
	    path: ctx.path,
	    errorMaps: [
	      ctx.common.contextualErrorMap,
	      ctx.schemaErrorMap,
	      z.getErrorMap(),
	      z.defaultErrorMap,
	    ].filter((x) => !!x) as z.ZodErrorMap[],
	    issueData: {
	      code: z.ZodIssueCode.invalid_return_type,
	      returnTypeError: error,
	    },
	  });
	}
    
	const params = { errorMap: ctx.common.contextualErrorMap };
	const fn = ctx.data;
    
	if (this._def.returns instanceof z.ZodPromise) {
	  // Would love a way to avoid disabling this rule, but we need
	  // an alias (using an arrow function was what caused 2651).
	  // eslint-disable-next-line @typescript-eslint/no-this-alias
	  const me = this;
	  return z.OK(async function (this: any, ...args: any[]) {
	    const error = new z.ZodError([]);
	    const parsedArgs = await me._def.args
	      .parseAsync(args, params)
	      .catch((e: any) => {
		error.addIssue(makeArgsIssue(args, e));
		throw error;
	      });
	    const result = await Reflect.apply(fn, this, (parsedArgs as any));
	    const parsedReturns = await (
	      me._def.returns as unknown as z.ZodPromise<z.ZodTypeAny>
	    )._def.type
	      .parseAsync(result, params)
	      .catch((e) => {
		error.addIssue(makeReturnsIssue(result, e));
		throw error;
	      });
	    return parsedReturns;
	  });
	} else {
	  // Would love a way to avoid disabling this rule, but we need
	  // an alias (using an arrow function was what caused 2651).
	  // eslint-disable-next-line @typescript-eslint/no-this-alias
	  const me = this;
	  return z.OK(function (this: any, ...args: any[]) {
	    const parsedArgs = me._def.args.safeParse(args, params);
	    if (!parsedArgs.success) {
	      throw new z.ZodError([makeArgsIssue(args, parsedArgs.error)]);
	    }
	    const result = Reflect.apply(fn, this, parsedArgs.data);
	    const parsedReturns = me._def.returns.safeParse(result, params);
	    if (!parsedReturns.success) {
	      throw new z.ZodError([makeReturnsIssue(result, parsedReturns.error)]);
	    }
	    return parsedReturns.data;
	  }) as any;
	}
      };
