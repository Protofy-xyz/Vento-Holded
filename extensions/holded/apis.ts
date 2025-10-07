import { getKey } from "@extensions/keys/coreContext";
import { getLogger } from 'protobase';
import { addAction } from "@extensions/actions/coreContext/addAction";
import { addCard } from "@extensions/cards/coreContext/addCard";
import { AutoAPI, handler, getServiceToken } from 'protonode'

const logger = getLogger()

const HOLDED_PROJECTS_BASE = "https://api.holded.com/api/projects/v1";
const HOLDED_TEAM_BASE = "https://api.holded.com/api/team/v1";

class HoldedService {
    private key: string;
    constructor(key: string) {
        this.key = key;
    }
    getEmployees() {
        return fetch(`${HOLDED_TEAM_BASE}/employees`, {
            headers: { accept: "application/json", key: this.key },
        }).then(res => res.json());
    }

    registerTimeToProject(projectId: string, userId: string, duration: number) {
        return fetch(`${HOLDED_PROJECTS_BASE}/projects/${projectId}/times`, {
            method: "POST",
            headers: { accept: "application/json", key: this.key },
            body: JSON.stringify({ userId, duration }),
        }).then(res => res.json());
    }

    getProjectTimeSlots(projectId: string) {
        return fetch(`${HOLDED_PROJECTS_BASE}/projects/${projectId}/times`, {
            headers: { accept: "application/json", key: this.key },
        }).then(res => res.json());
    }

    getProjects(params?: Record<string, any>) {
        const qs = params
            ? '?' + new URLSearchParams(
                Object.entries(params).reduce((acc, [k, v]) => {
                    if (v !== undefined && v !== null && String(v) !== '') acc[k] = String(v);
                    return acc;
                }, {} as Record<string, string>)
            ).toString()
            : '';
        return fetch(`${HOLDED_PROJECTS_BASE}/projects${qs}`, {
            headers: { accept: "application/json", key: this.key },
        }).then(res => res.json());
    }
    // ==== En la clase HoldedService, añade este método ====
    updateProjectTime(projectId: string, timeTrackingId: string, payload: Record<string, any>) {
        return fetch(`${HOLDED_PROJECTS_BASE}/projects/${projectId}/times/${timeTrackingId}`, {
            method: "PUT",
            headers: { accept: "application/json", key: this.key, "content-type": "application/json" },
            body: JSON.stringify(payload),
        }).then(res => res.json());
    }
}

export default async (app, context) => {
    //context allows to use extension functions without directly importing the extension.
    //app is a normal expressjs object
    //context.mqtt is a mqttclient connection
    //this a wrapper around express, you can directly execute this automation in 
    // /api/v1/automations/holded
    // use query parameters in the url to pass parameters to the automation

    //app.get(...) is possible here to create normal express endpoints

    app.get('/api/v1/holded/employees', async (req, res) => {
        try {
            const key = await getKey({ key: "HOLDED_API_KEY" })
            const holdedService = new HoldedService(
                key || process.env.HOLDED_API_KEY
            );
            const employees = await holdedService.getEmployees();
            res.json(employees);
        } catch (error) {
            logger.error("Error fetching employees from Holded:", error);
            res.status(500).json({ error: "Failed to fetch employees" });
        }
    });

    app.get('/api/v1/holded/project_time_slots', async (req, res) => {
        const projectId = req.query.projectId as string;
        if (!projectId) {
            res.status(400).json({ error: "projectId query parameter is required" });
            return;
        }
        try {
            const key = await getKey({ key: "HOLDED_API_KEY" })
            const holdedService = new HoldedService(
                key || process.env.HOLDED_API_KEY
            );
            const timeSlots = await holdedService.getProjectTimeSlots(projectId);
            res.json(timeSlots);
        } catch (error) {
            logger.error("Error fetching project time slots from Holded:", error);
            res.status(500).json({ error: "Failed to fetch project time slots" });
        }
    });

    // === Registrar time slot en un proyecto ===
    app.post('/api/v1/holded/register_time', async (req, res) => {
        try {
            const { projectId, userId, duration } = req.body || {};
            if (!projectId || !userId || (duration === undefined || duration === null)) {
                return res.status(400).json({ error: "Parámetros requeridos: projectId, userId, duration" });
            }

            const key = await getKey({ key: "HOLDED_API_KEY" });
            const holdedService = new HoldedService(
                key || process.env.HOLDED_API_KEY
            );

            const result = await holdedService.registerTimeToProject(
                String(projectId),
                String(userId),
                Number(duration)
            );

            res.json(result);
        } catch (error) {
            logger.error("Error registrando time slot en Holded:", error);
            res.status(500).json({ error: "Failed to register time slot" });
        }
    });

    // === Endpoint: listar projects ===
    app.get('/api/v1/holded/projects', async (req, res) => {
        try { 
            const key = await getKey({ key: "HOLDED_API_KEY" });
            const holdedService = new HoldedService(key || process.env.HOLDED_API_KEY);

            // Pasamos cualquier query param tal cual a Holded (page, limit, archived, status, name, customerId, etc.)
            const params = req.query ? Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) : {};

            const projects = await holdedService.getProjects(params);
            res.json(projects);
        } catch (error) {
            logger.error("Error fetching projects from Holded:", error);
            res.status(500).json({ error: "Failed to fetch projects" });
        }
    });

    // ==== Endpoint Express para actualizar un time tracking de proyecto ====
    app.post('/api/v1/holded/update_project_time', async (req, res) => { 
        try {
            const {
                projectId,
                timeTrackingId,
                // Campos opcionales según lo que quieras actualizar:
                // duration (en segundos), desc (string), costHour (número),
                // date (ISO string o yyyy-mm-dd), start, end, userId, taskId, categoryId, billable, etc.
                ...rest
            } = req.body || {};

            if (!projectId) return res.status(400).json({ error: "projectId is required" });
            if (!timeTrackingId) return res.status(400).json({ error: "timeTrackingId is required" });

            // Limpiar payload: elimina claves vacías/undefined/""
            const payload: Record<string, any> = {};
            Object.entries(rest).forEach(([k, v]) => {
                if (v !== undefined && v !== null && String(v) !== '') payload[k] = v;
            });

            if (Object.keys(payload).length === 0) {
                return res.status(400).json({ error: "Provide at least one field to update" });
            }

            const key = await getKey({ key: "HOLDED_API_KEY" });
            const holdedService = new HoldedService(key || process.env.HOLDED_API_KEY);

            const result = await holdedService.updateProjectTime(String(projectId), String(timeTrackingId), payload);
            res.json(result);
        } catch (error) {
            logger.error("Error updating project time in Holded:", error);
            res.status(500).json({ error: "Failed to update project time" });
        }
    });

    const registerActions = async () => {
        // ==== Action para actualizar un time tracking de proyecto ====
        addAction({
            group: 'holded',
            tag: 'holded',
            name: 'holded_update_project_time',
            description: 'Actualiza un time tracking de un proyecto en Holded',
            url: '/api/v1/holded/update_project_time',
            params: {
                projectId: "ID del proyecto (obligatorio)",
                timeTrackingId: "ID del time tracking (obligatorio)",

                // Campos opcionales (usa los que procedan en tu cuenta Holded):
                duration: "Duración en segundos (opcional)",
                desc: "Descripción (opcional)",
                costHour: "Coste/hora (opcional)",
                date: "Fecha (YYYY-MM-DD o ISO) (opcional)",
                start: "Inicio (ISO) (opcional)",
                end: "Fin (ISO) (opcional)",
                userId: "ID de usuario (opcional)",
                taskId: "ID de tarea (opcional)",
                categoryId: "ID de categoría (opcional)",
                billable: "true/false (opcional)"
            },
            emitEvent: true,
            receiveBoard: false,
            token: await getServiceToken(),
            method: 'post'
        });

        // === Action: listar projects ===
        addAction({
            group: 'holded',
            tag: 'holded',
            name: 'holded_projects',
            description: 'Obtiene la lista de proyectos de Holded',
            url: '/api/v1/holded/projects',
            // Filtros opcionales (los puedes dejar vacíos)
            params: {
                name: "Filtra por nombre (opcional)",
                status: "Estado (opcional)",
                archived: "true/false (opcional)",
                customerId: "ID cliente (opcional)",
                page: "Página (opcional)",
                limit: "Límite (opcional)"
            },
            emitEvent: true,
            receiveBoard: false,
            token: await getServiceToken(),
            method: 'get'
        });

        // === Action para registrar time slot ===
        addAction({
            group: 'holded',
            tag: 'holded',
            name: 'holded_register_time',
            description: 'Registra un intervalo de tiempo en un proyecto de Holded',
            url: '/api/v1/holded/register_time',
            params: { projectId: "ID del proyecto", userId: "ID del usuario", duration: "Duración (número en segundos)" },
            emitEvent: true,
            receiveBoard: false,
            token: await getServiceToken(),
            method: 'post'
        });
 
        addAction({
            group: 'holded',
            tag: 'holded',
            name: 'holded_employees',
            description: 'Obtiene la lista de empleados de Holded',
            url: '/api/v1/holded/employees',
            params: {},
            emitEvent: true,
            receiveBoard: false,
            token: await getServiceToken(),
            method: 'get'
        });

        addAction({
            group: 'holded',
            tag: 'holded',
            name: 'holded_project_time_slots',
            description: 'Obtiene los intervalos de tiempo de un proyecto en Holded',
            url: '/api/v1/holded/project_time_slots',
            params: { projectId: "ID del proyecto" },
            emitEvent: true,
            receiveBoard: false,
            token: await getServiceToken(),
            method: 'get'
        });
    }

    const registerCards = async () => {
        // ==== Card  para actualizar un time tracking de proyecto ====
        addCard({
            group: 'holded',
            tag: 'table',
            id: 'holded_update_project_time_request',
            templateName: 'Editar registro temporal de Holded',
            name: 'holded_update_project_time', 
            defaults: {
                width: 3,
                height: 6,
                name: 'update project time',  
                icon: 'clock',
                color: '#ED4C46',
                description: 'Actualiza uno o varios campos de un time tracking de proyecto ',
                type: 'action',
                params: {
                    projectId: "projectId",
                    timeTrackingId: "timeTrackingId",
                    // Opcionales
                    duration: "duration",
                    desc: "desc",
                    costHour: "costHour",
                    date: "date",
                    start: "start",
                    end: "end",
                    userId: "userId",
                    taskId: "taskId",
                    categoryId: "categoryId",
                    billable: "billable"
                },
                rulesCode: `
            if(!userParams.projectId) throw "projectId parameter is required";
            if(!userParams.timeTrackingId) throw "timeTrackingId parameter is required";

            // Construir payload ignorando vacíos
            const allowed = ["duration","desc","costHour","date","start","end","userId","taskId","categoryId","billable"];
            const payload = { projectId: userParams.projectId, timeTrackingId: userParams.timeTrackingId };
            for (const k of allowed) {
                const v = userParams[k];
                if (v !== undefined && v !== null && String(v) !== "") {
                    // casteos útiles
                    if (k === "duration" || k === "costHour") payload[k] = Number(v);
                    else if (k === "billable") payload[k] = (String(v).toLowerCase() === "true"); 
                    else payload[k] = v;
                }
            }

            // Necesario al menos 1 campo para actualizar
            const keys = Object.keys(payload).filter(k => !["projectId","timeTrackingId"].includes(k)); 
            if (keys.length === 0) throw "Provide at least one updatable field";

            return await execute_action('/api/v1/holded/update_project_time', payload, { method: 'post' });
        `,
                configParams: {
                    projectId: { visible: true, defaultValue: "", type: "text", label: "Project ID *" },
                    timeTrackingId: { visible: true, defaultValue: "", type: "text", label: "Time Tracking ID *" },

                    duration: { visible: true, defaultValue: "", type: "number", label: "Duration (seconds)" },
                    desc: { visible: false, defaultValue: "", type: "text", label: "Description" },
                    costHour: { visible: false, defaultValue: "", type: "number", label: "Cost/hour" },
                    date: { visible: false, defaultValue: "", type: "text", label: "Date (YYYY-MM-DD or ISO)" },
                    start: { visible: false, defaultValue: "", type: "text", label: "Start (ISO)" },
                    end: { visible: false, defaultValue: "", type: "text", label: "End (ISO)" },
                    userId: { visible: false, defaultValue: "", type: "text", label: "User ID" },
                    taskId: { visible: false, defaultValue: "", type: "text", label: "Task ID" },
                    categoryId: { visible: false, defaultValue: "", type: "text", label: "Category ID" },
                    billable: { visible: false, defaultValue: "", type: "text", label: "Billable (true/false)" }
                }
            },
            emitEvent: true
        });

        // === Card: listar projects  ===
        addCard({
            group: 'holded',
            tag: 'table',
            id: 'holded_projects_request',
            templateName: 'Proyectos de Holded',
            name: 'holded_projects',
            defaults: {
                width: 3,
                height: 5,
                color: '#ED4C46',
                name: 'Proyectos de Holded',
                icon: 'list',
                description: 'Lista de proyectos desde Holded ',
                type: 'action',
                params: {
                    name: "name",
                    status: "status",
                    archived: "archived",
                    customerId: "customerId",
                    page: "page",
                    limit: "limit" 
                },
                rulesCode: `
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
            `,
                configParams: {
                    name: { visible: true, defaultValue: "", type: "text", label: "Name (contiene)" },
                    status: { visible: true, defaultValue: "", type: "text", label: "Status" },
                    archived: { visible: true, defaultValue: "", type: "text", label: "Archived (true/false)" },
                    customerId: { visible: true, defaultValue: "", type: "text", label: "Customer ID" },
                    page: { visible: true, defaultValue: "", type: "number", label: "Page" },
                    limit: { visible: true, defaultValue: "", type: "number", label: "Limit" }
                }
            },
            emitEvent: true
        });

        // === Card para disparar el registro de time slot ===
        addCard({
            group: 'holded',
            tag: 'table',
            id: 'holded_register_time_request',
            templateName: 'Registrar tiempo en Holded',
            name: 'holded_register_time',
            defaults: {
                width: 3,
                height: 5,
                name: 'Registrar tiempo en proyecto',
                icon: 'clock',
                color: '#ED4C46',
                description: 'Registra un intervalo de tiempo (duration en segundos) en un proyecto de Holded',
                type: 'action',
                params: { projectId: "projectId", userId: "userId", duration: "duration" },
                rulesCode: `
                if(!userParams.projectId) throw "projectId parameter is required";
                if(!userParams.userId) throw "userId parameter is required";
                if(userParams.duration === undefined || userParams.duration === null || userParams.duration === "") throw "duration parameter is required";
                const payload = {
                    projectId: userParams.projectId,
                    userId: userParams.userId,
                    duration: Number(userParams.duration)
                };
                return await execute_action('/api/v1/holded/register_time', payload, { method: 'post' });
            `,
                configParams: {
                    projectId: { visible: true, defaultValue: "", type: "text", label: "Project ID" },
                    userId: { visible: true, defaultValue: "", type: "text", label: "User ID" },
                    duration: { visible: true, defaultValue: "3600", type: "number", label: "Duration (seconds)" }
                }
            },
            emitEvent: true
        });

        addCard({
            group: 'holded',
            tag: 'table',
            id: 'holded_employees_request',
            templateName: 'Empleados de Holded',
            name: 'holded_employees',
            defaults: {
                width: 3,
                height: 5,
                color: '#ED4C46',
                name: 'Empleados de Holded',
                icon: 'users',
                description: 'Lista de empleados desde Holded',
                type: 'action',
                rulesCode: `return await execute_action('/api/v1/holded/employees', {});`,
            },
            emitEvent: true
        });

        addCard({
            group: 'holded',
            tag: 'table',
            id: 'holded_project_time_slots_request',
            templateName: 'Registros temporales de Holded',
            name: 'holded_project_time_slots',
            defaults: {
                width: 3,
                height: 5,
                name: 'Intervalos de tiempo de proyecto en Holded',
                icon: 'clock',
                color: '#ED4C46',
                description: 'Intervalos de tiempo de un proyecto desde Holded',
                type: 'action',
                params: { projectId: "projectId" },
                rulesCode: `if(!userParams.projectId) throw "projectId parameter is required"; return await execute_action('/api/v1/holded/project_time_slots', { projectId: userParams.projectId });`,
                configParams: {
                    projectId: {
                        visible: true,
                        defaultValue: "",
                        type: "text"
                    }
                }
            },
            emitEvent: true
        });
    }

    await registerActions();
    await registerCards();

    logger.info("Holded extension initialized");
}