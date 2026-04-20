

import { IQueryConfig, IQueryParams, IQueryResult, PrismaCountArgs, PrismaFindManyArgs, PrismaModelDelegate, PrismaNumberFilter, PrismaStringFilter, PrismaWhereConditions } from "../interface/query.interface";

export class QueryBuilder<T, TWhereInput = Record<string, unknown>, TInclude = Record<string, unknown>> {
    private query: PrismaFindManyArgs;
    private countQuery: PrismaCountArgs;
    private page: number = 1;
    private limit: number = 10;
    private skip: number = 0;
    private sortBy: string = "createdAt";
    private sortOrder: "asc" | "desc" = "desc";
    private selectFields: Record<string, boolean> | undefined
    constructor(private model: PrismaModelDelegate, private queryParams: IQueryParams, private config: IQueryConfig = {}) {
        this.query = {
            where: {},
            include: {},
            orderBy: {},
            select: {},
            skip: 0,
            take: 10
        }
        this.countQuery = {
            where: {},
        }

    }
    search(): this {
        const { searchTerm } = this.queryParams;
        const { searchableFields } = this.config;
        // doctorSearchableFields = ['user.name', 'user.email', 'specialties.specialty.title' , 'specialties.specialty.description']
        if (searchTerm && searchableFields && searchableFields.length > 0) {
            const searchConditions: Record<string, unknown>[] = searchableFields.map((field) => {
                if (field.includes(".")) {
                    const parts = field.split(".");

                    if (parts.length === 2) {
                        const [relation, nestedField] = parts;

                        const stringFilter: PrismaStringFilter = {
                            contains: searchTerm,
                            mode: 'insensitive' as const,
                        }

                        return {
                            [relation]: {
                                [nestedField]: stringFilter
                            }
                        }
                    } else if (parts.length === 3) {
                        const [relation, nestedRelation, nestedField] = parts;

                        const stringFilter: PrismaStringFilter = {
                            contains: searchTerm,
                            mode: 'insensitive' as const,
                        }

                        return {
                            [relation]: {
                                some: {
                                    [nestedRelation]: {
                                        [nestedField]: stringFilter
                                    }
                                }
                            }
                        }
                    }

                }
                // direct field
                const stringFilter: PrismaStringFilter = {
                    contains: searchTerm,
                    mode: 'insensitive' as const,
                }

                return {
                    [field]: stringFilter
                }
            }
            )

            const whereConditions = this.query.where as PrismaWhereConditions

            whereConditions.OR = searchConditions;

            const countWhereConditions = this.countQuery.where as PrismaWhereConditions;
            countWhereConditions.OR = searchConditions;
        }

        return this;
    }
    filter(): this {

        const { filterableFields } = this.config;
        const excludedField = ['searchTerm', 'page', 'limit', 'sortBy', 'sortOrder', 'fields', 'include'];

        const filterParams: Record<string, unknown> = {};

        Object.keys(this.queryParams).forEach((key) => {
            if (!excludedField.includes(key)) {
                filterParams[key] = this.queryParams[key];
            }
        })
        //{nmae: "abc", age: 20}

        const queryWhere = this.query.where as Record<string, unknown>;
        const countQueryWhere = this.countQuery.where as Record<string, unknown>;

        Object.keys(filterParams).forEach((key) => {
            const value = filterParams[key];
            //name = "abc", age = 20
            if (value === undefined || value === "") {
                return;
            }

            const isAllowedField = !filterableFields || filterableFields.length === 0 || filterableFields.includes(key);


            // doctorFilterableFields = ['specialties.specialty.title', 'appointmentFee']
            // /doctors?appointmentFee[lt]=100&appointmentFee[gt]=50 => { appointmentFee: { lt: '100', gt: '50' } }

            // /doctors?user.name=John => { user: { name: 'John' } }
            if (key.includes(".")) {
                const parts = key.split(".");

                if (filterableFields && !filterableFields.includes(key)) {
                    return;
                }



                if (parts.length === 2) {
                    const [relation, nestedField] = parts;
                    //relation = 'user', nestedField = 'name'
                    if (!queryWhere[relation]) {
                        queryWhere[relation] = {};
                        countQueryWhere[relation] = {};
                        //user = {}
                    }

                    const queryRelation = queryWhere[relation] as Record<string, unknown>;
                    // where = { user: {} }
                    const countRelation = countQueryWhere[relation] as Record<string, unknown>;
                    // where= {user: {}}
                    queryRelation[nestedField] = this.parseFilterValue(value);
                    //where = {user: {name: 'John'}}
                    countRelation[nestedField] = this.parseFilterValue(value);
                    //where = {user: {name: 'John'}}
                    return;
                }
                // /doctors?specialties.specialty.title=abc => { specialties: { some: { specialty: { title: 'abc' } } } }
                else if (parts.length === 3) {
                    const [relation, nestedRelation, nestedField] = parts;

                    if (!queryWhere[relation]) {
                        queryWhere[relation] = {
                            some: {}
                        };
                        // specialties: { }
                        countQueryWhere[relation] = {
                            some: {}
                        };
                    }

                    const queryRelation = queryWhere[relation] as Record<string, unknown>;
                    //where:{ specialties: { some: {} } }
                    const countRelation = countQueryWhere[relation] as Record<string, unknown>;

                    if (!queryRelation.some) {
                        queryRelation.some = {};
                        //where:{ specialties: { some: {} } }
                    }
                    if (!countRelation.some) {
                        countRelation.some = {};
                    }

                    const querySome = queryRelation.some as Record<string, unknown>;
                    //where:{ specialties: { some: {} } }
                    const countSome = countRelation.some as Record<string, unknown>;

                    if (!querySome[nestedRelation]) {
                        querySome[nestedRelation] = {};
                        //where:{ specialties: { some: { specialty: {} } } }
                    }

                    if (!countSome[nestedRelation]) {
                        countSome[nestedRelation] = {};
                    }

                    const queryNestedRelation = querySome[nestedRelation] as Record<string, unknown>;
                    //where:{ specialties: { some: { specialty: {} } } }
                    const countNestedRelation = countSome[nestedRelation] as Record<string, unknown>;

                    queryNestedRelation[nestedField] = this.parseFilterValue(value);
                    //where:{specialties:{some:{specialty:{title: 'abc'}}}}
                    countNestedRelation[nestedField] = this.parseFilterValue(value);

                    return;
                }

            }
            if (!isAllowedField) {
                return;
            }


            // Range filter parsing
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                queryWhere[key] = this.parseRangeFilter(value as Record<string, string | number>);
                countQueryWhere[key] = this.parseRangeFilter(value as Record<string, string | number>);
                return;
            }

            //direct value parsing
            queryWhere[key] = this.parseFilterValue(value);
            countQueryWhere[key] = this.parseFilterValue(value);
        })
        return this;
    }
    paginate(): this {
        const page = Number(this.queryParams.page) || 1;
        const limit = Number(this.queryParams.limit) || 10;
        this.page = page;
        this.limit = limit;
        this.skip = (page - 1) * limit
        this.query.skip = this.skip;
        this.query.take = this.limit;
        return this
    }
    sort(): this {

        // Get sort field from query params
        // Default = createdAt
        const sortBy = this.queryParams.sortBy || "createdAt";

        // Get sorting direction
        // If sortOrder = asc → ascending
        // Otherwise default = desc
        const sortOrder =
            this.queryParams.sortOrder === "asc" ? "asc" : "desc";

        // Store values in class properties
        this.sortBy = sortBy;
        this.sortOrder = sortOrder;

        // Example:
        // /doctors?sortBy=user.name&sortOrder=asc
        //
        // Expected Prisma output:
        // {
        //   orderBy: {
        //     user: {
        //       name: "asc"
        //     }
        //   }
        // }

        // Check if nested sorting is used
        if (sortBy.includes(".")) {

            // Split by dot
            // user.name => ["user", "name"]
            // user.profile.name => ["user", "profile", "name"]
            const parts = sortBy.split(".");

            // Case 1: One relation + one field
            // user.name
            if (parts.length === 2) {
                const [relation, nestedField] = parts;

                this.query.orderBy = {
                    [relation]: {
                        [nestedField]: sortOrder
                    }
                };

                // Case 2: Two nested relations + field
                // user.profile.name
            } else if (parts.length === 3) {
                const [relation, nestedRelation, nestedField] = parts;

                this.query.orderBy = {
                    [relation]: {
                        [nestedRelation]: {
                            [nestedField]: sortOrder
                        }
                    }
                };

                // Case 3: Unexpected format
                // Use direct sorting
            } else {
                this.query.orderBy = {
                    [sortBy]: sortOrder
                };
            }

        } else {

            // Normal sorting
            // sortBy=name
            //
            // {
            //   orderBy: {
            //     name: "asc"
            //   }
            // }
            this.query.orderBy = {
                [sortBy]: sortOrder
            };
        }

        // Return current instance for chaining
        return this;
    }
    fields(): this {
        // Get the "fields" query parameter from request
        const fieldsParam = this.queryParams.fields;

        // Example:
        // /doctors?fields=user.name,user.email
        // Expected output:
        // {
        //   select: {
        //     user: {
        //       select: {
        //         name: true,
        //         email: true
        //       }
        //     }
        //   }
        // }

        // Check if fields exists and is a string
        if (fieldsParam && typeof fieldsParam === "string") {

            // Convert comma-separated string into array
            // ["user.name", "user.email"]
            const fieldsArray = fieldsParam
                .split(",")
                .map(field => field.trim());

            // Initialize selectFields object
            this.selectFields = {};

            // Loop through each field
            fieldsArray.forEach(field => {
                if (this.selectFields) {

                    // Add field as true
                    // Result:
                    // {
                    //   "user.name": true,
                    //   "user.email": true
                    // }
                    this.selectFields[field] = true;
                }
            });

            // Assign select object to query
            this.query.select = this.selectFields;

            // Remove include because select and include
            // cannot be used together in Prisma
            delete this.query.include;
        }

        // Return current instance for method chaining
        return this;
    }
    include(relation: TInclude): this {

        // If selectFields already exists,
        // it means fields() method has used select query.
        // Prisma does not allow using select + include together.
        // So stop here and return current instance.
        if (this.selectFields) {
            return this;
        }

        // Merge previous include relations with new relation
        // Example:
        // Existing:
        // { user: true }
        //
        // New relation:
        // { appointments: true }
        //
        // Result:
        // {
        //   user: true,
        //   appointments: true
        // }
        this.query.include = {
            ...(this.query.include as Record<string, unknown>),
            ...(relation as Record<string, unknown>)
        };

        // Return current instance for method chaining
        return this;
    }
    dynamicInclude(
        includeConfig: Record<string, unknown>,   // allowed relations config
        defaultConfig?: string[]                 // default include fields (optional)
    ): this {

        // If specific fields already selected, skip include logic
        if (this.selectFields) {
            return this;
        }

        // Store final include relations here
        const result: Record<string, unknown> = {};

        // Add default relations
        defaultConfig?.forEach((field) => {

            // Check if field exists in includeConfig
            if (includeConfig[field]) {

                // Add to result
                result[field] = includeConfig[field];
            }
        });

        // Read include from query string
        // Example: ?include=posts,profile
        const includeParam = this.queryParams.include as string | undefined;

        // If include exists and is string
        if (includeParam && typeof includeParam === "string") {

            // Convert string to array
            // "posts,profile" => ["posts", "profile"]
            const requestedRelation = includeParam
                .split(",")
                .map(relation => relation.trim());

            // Loop through requested relations
            requestedRelation.forEach(relation => {

                // If relation allowed
                if (includeConfig[relation]) {

                    // Add to result
                    result[relation] = includeConfig[relation];
                }
            });
        }

        // Merge old include + new include
        this.query.include = {
            ...(this.query.include as Record<string, unknown>),
            ...result
        };

        // Return this for chaining
        return this;
    }
    where(condition: TWhereInput): this {
        this.query.where = this.deepMerge(this.query.where as Record<string, unknown>, condition as Record<string, unknown>);
        this.countQuery.where = this.deepMerge(this.countQuery.where as Record<string, unknown>, condition as Record<string, unknown>);
        return this
    }
    async execute(): Promise<IQueryResult<T>> {
        const [total, data] = await Promise.all([
            this.model.count(this.countQuery as Parameters<typeof this.model.count>[0]),
            this.model.findMany(this.query as Parameters<typeof this.model.findMany>[0])

        ])
        const totalPages = Math.ceil(total / this.limit);
        return {
            data: data as T[],
            meta: {
                page: this.page,
                limit: this.limit,
                total,
                totalPages
            }
        }
    }
    async count(): Promise<number> {
        return await this.model.count(this.countQuery as Parameters<typeof this.model.count>[0])
    }
    getQuery(): PrismaFindManyArgs {
        return this.query
    }
    private deepMerge(
        target: Record<string, unknown>,   // old object
        source: Record<string, unknown>    // new object
    ): Record<string, unknown> {

        // Copy old object first
        // Example:
        // target = { name: "Rahim" }
        const result = { ...target };

        // Loop through every key in source object
        for (const key in source) {

            // Check if source[key] is an object (not array)
            // Example:
            // profile: { age: 20 }
            if (
                source[key] &&
                typeof source[key] === "object" &&
                !Array.isArray(source[key])
            ) {

                // If result[key] also exists and is object
                // Then merge both nested objects
                if (
                    result[key] &&
                    typeof result[key] === "object" &&
                    !Array.isArray(result[key])
                ) {

                    // Recursive merge
                    result[key] = this.deepMerge(
                        result[key] as Record<string, unknown>,
                        source[key] as Record<string, unknown>
                    );

                } else {

                    // If old value not object, replace directly
                    result[key] = source[key];
                }

            } else {

                // If value is normal value
                // Example:
                // age: 20
                // isActive: true
                // name: "Rahim"
                result[key] = source[key];
            }
        }

        // Return final merged object
        return result;
    }
    private parseFilterValue(value: unknown): unknown {
        if (value === "true") {
            return true
        }
        if (value === "false") {
            return false
        }
        if (typeof value === "string" && !isNaN(Number(value)) && value !== "") {
            return Number(value)
        }
        if (Array.isArray(value)) {
            return { in: value.map((item) => this.parseFilterValue(item)) }
        }
        return value
    }
    private parseRangeFilter(value: Record<string, string | number>): PrismaNumberFilter | PrismaStringFilter | Record<string, unknown> {
        const rangeQuery: Record<string, string | number | (string | number)[]> = {};
        Object.keys(value).forEach((operator) => {
            const operatorValue = value[operator];
            const parseValue: string | number = typeof operatorValue === "string" && !isNaN(Number(operatorValue)) ? Number(operatorValue) : operatorValue;
            switch (operator) {
                case "lt":
                case "lte":
                case "gt":
                case "gte":
                case "not":
                case "equals":
                case "contains":
                case "startsWith":
                case "endsWith":
                    rangeQuery[operator] = parseValue;
                    break;
                case "in":
                case "notIn":
                    if (Array.isArray(operatorValue)) {
                        rangeQuery[operator] = operatorValue
                    } else {
                        rangeQuery[operator] = [parseValue]
                    }
                    break;
                default:
                    break;
            }
        });
        return Object.keys(rangeQuery).length > 0 ? rangeQuery : value
    }

}

