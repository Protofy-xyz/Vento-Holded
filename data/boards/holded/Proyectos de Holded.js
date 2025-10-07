
                // Construimos los filtros ignorando vacíos
                const filters = {};
                const keys = ["name","status","archived","customerId","page","limit"];
                for (const k of keys) {
                    const v = userParams[k];
                    if (v !== undefined && v !== null && String(v) !== "") {
                        filters[k] = v;
                    }
                } 
                return await execute_action('/api/v1/holded/projects', filters);
            