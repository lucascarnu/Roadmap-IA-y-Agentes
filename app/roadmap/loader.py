"""Read, validate and index the six repository entity types.

This module deliberately has no Flask dependency.  The filesystem remains the
source of truth and every index is rebuilt in memory.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Any, Iterable

import yaml
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode


ENTITY_DIRECTORIES = {
    "categoria": "categorias",
    "capacidad": "capacidades",
    "nodo": "nodos",
    "fuente": "fuentes",
    "herramienta": "herramientas",
    "proyecto": "proyectos",
}
FRONTMATTER_KINDS = {"nodo", "fuente", "herramienta", "proyecto"}
FRONTMATTER_RE = re.compile(
    r"\A---[ \t]*\r?\n(?P<yaml>.*?)(?:\r?\n)---[ \t]*(?:\r?\n|\Z)", re.DOTALL
)
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
PLATFORM_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

NODE_STATES = {"pendiente", "en-curso", "aprendido"}
PRIORITIES = {"alta", "media", "baja"}
DURATIONS = {"corta", "media", "larga"}
SOURCE_FORMATS = {
    "video", "articulo", "documentacion", "repositorio",
    "curso", "libro", "publicacion", "conversacion",
}
CLASSIFICATIONS = {"pendiente", "oro", "plata", "descartada"}
TOOL_TYPES = {
    "herramienta", "skill", "plugin", "mcp",
    "servicio", "agente", "repositorio", "app",
}
PROJECT_STATES = {"activo", "pausado", "terminado"}
ACTION_FIELDS = {
    "proxima_accion", "duracion_proxima_accion",
    "nodos_requeridos", "capacidades_requeridas",
}
CLASSIFICATION_ORDER = {"oro": 0, "plata": 1, "pendiente": 2, "descartada": 3}


@dataclass
class Entity:
    kind: str
    identifier: str
    path: str
    title: str | None = None
    body: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    yaml_nodes: dict[str, Node] = field(default_factory=dict, repr=False)

    @property
    def valid(self) -> bool:
        return not self.errors


@dataclass
class RoadmapIndex:
    entities: dict[str, dict[str, Entity]]
    direct_relations: dict[tuple[str, str], dict[str, Any]]
    category_references: dict[str, list[tuple[str, str]]]
    source_nodes: dict[str, list[str]]
    source_tools: dict[str, list[str]]
    node_dependents: dict[str, list[str]]
    node_projects: dict[str, list[str]]
    capability_tools: dict[str, list[tuple[str, str]]]
    node_available: dict[str, bool]
    node_blockers: dict[str, list[str]]
    precedence_edges: list[tuple[str, str]]
    project_ready: dict[str, bool]
    node_counts_by_category: dict[str, int]
    dependency_cycles: list[tuple[str, ...]]

    def all_entities(self) -> Iterable[Entity]:
        for kind in ENTITY_DIRECTORIES:
            yield from self.entities[kind].values()


def _split_frontmatter(text: str) -> tuple[str | None, str]:
    match = FRONTMATTER_RE.match(text)
    if not match:
        return None, text
    return match.group("yaml"), text[match.end():]


def _mapping_nodes(document: Node | None) -> dict[str, Node]:
    if not isinstance(document, MappingNode):
        return {}
    result: dict[str, Node] = {}
    for key, value in document.value:
        if isinstance(key, ScalarNode):
            result[str(key.value)] = value
    return result


def _read_entity(root: Path, kind: str, path: Path) -> Entity:
    relative = path.relative_to(root).as_posix()
    entity = Entity(kind=kind, identifier=path.stem, path=relative)
    if not ID_RE.fullmatch(entity.identifier):
        entity.errors.append("el identificador debe estar en kebab-case")

    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        entity.errors.append(f"no se pudo leer como UTF-8: {exc}")
        return entity

    yaml_text, body = _split_frontmatter(text)
    entity.body = body
    title = H1_RE.search(body)
    if title:
        entity.title = title.group(1).strip()

    if kind in FRONTMATTER_KINDS:
        if yaml_text is None:
            entity.errors.append("falta frontmatter YAML")
        else:
            try:
                loaded = yaml.safe_load(yaml_text)
                document = yaml.compose(yaml_text)
                if loaded is None:
                    entity.metadata = {}
                elif isinstance(loaded, dict):
                    entity.metadata = loaded
                else:
                    entity.errors.append("el frontmatter debe ser un mapa YAML")
                entity.yaml_nodes = _mapping_nodes(document)
            except yaml.YAMLError as exc:
                entity.errors.append(f"frontmatter YAML inválido: {exc}")
    elif yaml_text is not None:
        entity.errors.append("esta entidad no admite frontmatter")

    if not entity.title:
        entity.errors.append("falta un título H1")
    return entity


def _require(entity: Entity, fields: Iterable[str]) -> None:
    for name in fields:
        if name not in entity.metadata:
            entity.errors.append(f"falta el campo obligatorio '{name}'")


def _allowed(entity: Entity, name: str, values: set[str]) -> None:
    if name in entity.metadata and entity.metadata[name] not in values:
        allowed = ", ".join(sorted(values))
        entity.errors.append(f"'{name}' debe ser uno de: {allowed}")


def _list(entity: Entity, name: str, *, required: bool = False) -> list[Any]:
    if name not in entity.metadata:
        if required:
            entity.errors.append(f"falta el campo obligatorio '{name}'")
        return []
    value = entity.metadata[name]
    if not isinstance(value, list):
        entity.errors.append(f"'{name}' debe ser una lista")
        return []
    return value


def _identifier_list(entity: Entity, name: str, *, required: bool = False) -> list[str]:
    values = _list(entity, name, required=required)
    for index, value in enumerate(values):
        if not isinstance(value, str) or not ID_RE.fullmatch(value):
            entity.errors.append(f"'{name}[{index}]' debe ser un identificador kebab-case")
    return [value for value in values if isinstance(value, str)]


def _string(entity: Entity, name: str) -> str | None:
    if name not in entity.metadata:
        return None
    value = entity.metadata[name]
    if not isinstance(value, str):
        entity.errors.append(f"'{name}' debe ser texto")
        return None
    return value


def _double_quoted(entity: Entity, name: str) -> None:
    node = entity.yaml_nodes.get(name)
    if node is not None and (not isinstance(node, ScalarNode) or node.style != '"'):
        entity.errors.append(f"'{name}' debe escribirse entre comillas dobles")


def _validate_node(entity: Entity) -> None:
    _require(entity, ("estado", "prioridad", "estimacion", "categoria", "depende_de", "fuentes"))
    _allowed(entity, "estado", NODE_STATES)
    _allowed(entity, "prioridad", PRIORITIES)
    _allowed(entity, "estimacion", DURATIONS)
    _string(entity, "categoria")
    _identifier_list(entity, "depende_de")
    _identifier_list(entity, "fuentes")


def _validate_source(entity: Entity) -> None:
    _require(entity, ("formato", "plataforma", "origen", "autor", "categoria", "clasificacion"))
    _allowed(entity, "formato", SOURCE_FORMATS)
    _allowed(entity, "clasificacion", CLASSIFICATIONS)
    platform = _string(entity, "plataforma")
    if platform is not None and not PLATFORM_RE.fullmatch(platform):
        entity.errors.append("'plataforma' debe ser un token en minúsculas y sin espacios")
    _string(entity, "origen")
    _string(entity, "autor")
    _string(entity, "categoria")
    _double_quoted(entity, "origen")
    materials = _list(entity, "materiales") if "materiales" in entity.metadata else []
    node = entity.yaml_nodes.get("materiales")
    if node is not None and isinstance(node, SequenceNode):
        for index, item in enumerate(node.value):
            if not isinstance(item, ScalarNode) or item.style != '"':
                entity.errors.append(f"'materiales[{index}]' debe escribirse entre comillas dobles")
    for index, material in enumerate(materials):
        if not isinstance(material, str):
            entity.errors.append(f"'materiales[{index}]' debe ser texto")


def _validate_tool(entity: Entity) -> None:
    _require(entity, ("tipo", "capacidades", "origen"))
    _allowed(entity, "tipo", TOOL_TYPES)
    capabilities = entity.metadata.get("capacidades")
    if "capacidades" in entity.metadata and not isinstance(capabilities, dict):
        entity.errors.append("'capacidades' debe ser un mapa")
    elif isinstance(capabilities, dict):
        for capability, classification in capabilities.items():
            if not isinstance(capability, str):
                entity.errors.append("cada clave de 'capacidades' debe ser texto")
            if classification not in CLASSIFICATIONS:
                entity.errors.append(
                    f"clasificación inválida para capacidad '{capability}'"
                )
    _string(entity, "origen")
    _double_quoted(entity, "origen")
    if "fuentes" in entity.metadata:
        _identifier_list(entity, "fuentes")


def _validate_project(entity: Entity) -> None:
    _require(entity, ("estado",))
    _allowed(entity, "estado", PROJECT_STATES)
    state = entity.metadata.get("estado")
    present_action = ACTION_FIELDS.intersection(entity.metadata)
    if state in {"activo", "pausado"}:
        if "prioridad" not in entity.metadata:
            entity.errors.append("falta el campo obligatorio 'prioridad'")
        _allowed(entity, "prioridad", PRIORITIES)
    elif state == "terminado" and "prioridad" in entity.metadata:
        entity.errors.append("un proyecto terminado no admite 'prioridad'")

    if state == "activo" and present_action != ACTION_FIELDS:
        entity.errors.append("un proyecto activo requiere el bloque completo de próxima acción")
    elif state == "pausado" and present_action and present_action != ACTION_FIELDS:
        entity.errors.append("un proyecto pausado requiere el bloque completo o completamente ausente")
    elif state == "terminado" and present_action:
        entity.errors.append("un proyecto terminado no admite campos de próxima acción")

    if present_action == ACTION_FIELDS:
        _string(entity, "proxima_accion")
        _double_quoted(entity, "proxima_accion")
        _allowed(entity, "duracion_proxima_accion", DURATIONS)
        _identifier_list(entity, "nodos_requeridos")
        _identifier_list(entity, "capacidades_requeridas")


def _validate_local(entity: Entity) -> None:
    if entity.kind == "nodo":
        _validate_node(entity)
    elif entity.kind == "fuente":
        _validate_source(entity)
    elif entity.kind == "herramienta":
        _validate_tool(entity)
    elif entity.kind == "proyecto":
        _validate_project(entity)


def _references(entity: Entity, field: str) -> list[str]:
    value = entity.metadata.get(field, [])
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _validate_reference(entity: Entity, field: str, target_kind: str, index: dict[str, dict[str, Entity]]) -> None:
    for identifier in _references(entity, field):
        if identifier not in index[target_kind]:
            entity.errors.append(f"'{field}' referencia {target_kind} inexistente: {identifier}")


def _find_cycles(nodes: dict[str, Entity]) -> list[tuple[str, ...]]:
    graph = {
        identifier: [dep for dep in _references(entity, "depende_de") if dep in nodes]
        for identifier, entity in nodes.items()
    }
    state: dict[str, int] = {}
    stack: list[str] = []
    cycles: set[tuple[str, ...]] = set()

    def visit(identifier: str) -> None:
        state[identifier] = 1
        stack.append(identifier)
        for dependency in graph[identifier]:
            if state.get(dependency, 0) == 0:
                visit(dependency)
            elif state.get(dependency) == 1:
                start = stack.index(dependency)
                cycle = stack[start:] + [dependency]
                core = cycle[:-1]
                rotations = [tuple(core[i:] + core[:i]) for i in range(len(core))]
                cycles.add(min(rotations))
        stack.pop()
        state[identifier] = 2

    for identifier in graph:
        if state.get(identifier, 0) == 0:
            visit(identifier)
    return sorted(cycles)


def load_repository(root: str | Path | None = None) -> RoadmapIndex:
    """Load the six entity directories from *root* into a read-only index."""
    root_path = Path(root) if root is not None else Path(__file__).resolve().parents[2]
    entities: dict[str, dict[str, Entity]] = {kind: {} for kind in ENTITY_DIRECTORIES}
    for kind, directory in ENTITY_DIRECTORIES.items():
        for path in sorted((root_path / directory).glob("*.md")):
            if path.name.casefold() == "readme.md":
                continue
            entity = _read_entity(root_path, kind, path)
            _validate_local(entity)
            entities[kind][entity.identifier] = entity

    for node in entities["nodo"].values():
        category = node.metadata.get("categoria")
        if isinstance(category, str) and category not in entities["categoria"]:
            node.errors.append(f"'categoria' referencia categoria inexistente: {category}")
        _validate_reference(node, "depende_de", "nodo", entities)
        _validate_reference(node, "fuentes", "fuente", entities)
    for source in entities["fuente"].values():
        category = source.metadata.get("categoria")
        if isinstance(category, str) and category not in entities["categoria"]:
            source.errors.append(f"'categoria' referencia categoria inexistente: {category}")
    for tool in entities["herramienta"].values():
        capabilities = tool.metadata.get("capacidades", {})
        if isinstance(capabilities, dict):
            for capability in capabilities:
                if isinstance(capability, str) and capability not in entities["capacidad"]:
                    tool.errors.append(f"'capacidades' referencia capacidad inexistente: {capability}")
        _validate_reference(tool, "fuentes", "fuente", entities)
    for project in entities["proyecto"].values():
        _validate_reference(project, "nodos_requeridos", "nodo", entities)
        _validate_reference(project, "capacidades_requeridas", "capacidad", entities)

    cycles = _find_cycles(entities["nodo"])
    for cycle in cycles:
        rendered = " -> ".join((*cycle, cycle[0]))
        for identifier in cycle:
            entities["nodo"][identifier].errors.append(f"ciclo de dependencias: {rendered}")

    category_references: defaultdict[str, list[tuple[str, str]]] = defaultdict(list)
    source_nodes: defaultdict[str, list[str]] = defaultdict(list)
    source_tools: defaultdict[str, list[str]] = defaultdict(list)
    node_dependents: defaultdict[str, list[str]] = defaultdict(list)
    node_projects: defaultdict[str, list[str]] = defaultdict(list)
    capability_tools: defaultdict[str, list[tuple[str, str]]] = defaultdict(list)

    for node in entities["nodo"].values():
        category = node.metadata.get("categoria")
        if isinstance(category, str) and category in entities["categoria"]:
            category_references[category].append(("nodo", node.identifier))
        for source in _references(node, "fuentes"):
            if source in entities["fuente"]:
                source_nodes[source].append(node.identifier)
        for dependency in _references(node, "depende_de"):
            if dependency in entities["nodo"]:
                node_dependents[dependency].append(node.identifier)
    for source in entities["fuente"].values():
        category = source.metadata.get("categoria")
        if isinstance(category, str) and category in entities["categoria"]:
            category_references[category].append(("fuente", source.identifier))
    for tool in entities["herramienta"].values():
        for source in _references(tool, "fuentes"):
            if source in entities["fuente"]:
                source_tools[source].append(tool.identifier)
        capabilities = tool.metadata.get("capacidades", {})
        if isinstance(capabilities, dict):
            for capability, classification in capabilities.items():
                if capability in entities["capacidad"] and classification in CLASSIFICATIONS:
                    capability_tools[capability].append((tool.identifier, classification))
    for project in entities["proyecto"].values():
        for node in _references(project, "nodos_requeridos"):
            if node in entities["nodo"]:
                node_projects[node].append(project.identifier)

    for values in capability_tools.values():
        values.sort(key=lambda item: (CLASSIFICATION_ORDER[item[1]], item[0]))

    direct_relations: dict[tuple[str, str], dict[str, Any]] = {}
    for node in entities["nodo"].values():
        direct_relations[("nodo", node.identifier)] = {
            "categoria": node.metadata.get("categoria"),
            "fuentes": _references(node, "fuentes"),
            "depende_de": _references(node, "depende_de"),
        }
    for source in entities["fuente"].values():
        direct_relations[("fuente", source.identifier)] = {
            "categoria": source.metadata.get("categoria"),
        }
    for tool in entities["herramienta"].values():
        capabilities = tool.metadata.get("capacidades", {})
        direct_relations[("herramienta", tool.identifier)] = {
            "capacidades": dict(capabilities) if isinstance(capabilities, dict) else {},
            "fuentes": _references(tool, "fuentes"),
        }
    for project in entities["proyecto"].values():
        direct_relations[("proyecto", project.identifier)] = {
            "nodos_requeridos": _references(project, "nodos_requeridos"),
            "capacidades_requeridas": _references(project, "capacidades_requeridas"),
        }

    node_available: dict[str, bool] = {}
    node_blockers: dict[str, list[str]] = {}
    precedence_edges: set[tuple[str, str]] = set()
    nodes = entities["nodo"]
    for identifier, node in nodes.items():
        dependencies = _references(node, "depende_de")
        node_available[identifier] = all(
            dependency in nodes and nodes[dependency].metadata.get("estado") == "aprendido"
            for dependency in dependencies
        )
        blockers: set[str] = set()
        pending = list(dependencies)
        seen: set[str] = set()
        while pending:
            dependency = pending.pop()
            if dependency in seen or dependency not in nodes:
                continue
            seen.add(dependency)
            precedence_edges.add((dependency, identifier))
            if nodes[dependency].metadata.get("estado") != "aprendido":
                blockers.add(dependency)
            pending.extend(_references(nodes[dependency], "depende_de"))
        node_blockers[identifier] = sorted(blockers)

    project_ready = {
        identifier: project.metadata.get("estado") == "activo"
        and all(
            node in nodes and nodes[node].metadata.get("estado") == "aprendido"
            for node in _references(project, "nodos_requeridos")
        )
        for identifier, project in entities["proyecto"].items()
    }
    node_counts: defaultdict[str, int] = defaultdict(int)
    for node in nodes.values():
        category = node.metadata.get("categoria")
        if isinstance(category, str) and category in entities["categoria"]:
            node_counts[category] += 1

    def sorted_dict(mapping: defaultdict[str, list[Any]]) -> dict[str, list[Any]]:
        return {key: sorted(value) for key, value in mapping.items()}

    return RoadmapIndex(
        entities=entities,
        direct_relations=direct_relations,
        category_references=sorted_dict(category_references),
        source_nodes=sorted_dict(source_nodes),
        source_tools=sorted_dict(source_tools),
        node_dependents=sorted_dict(node_dependents),
        node_projects=sorted_dict(node_projects),
        capability_tools=dict(capability_tools),
        node_available=node_available,
        node_blockers=node_blockers,
        precedence_edges=sorted(precedence_edges),
        project_ready=project_ready,
        node_counts_by_category=dict(node_counts),
        dependency_cycles=cycles,
    )
