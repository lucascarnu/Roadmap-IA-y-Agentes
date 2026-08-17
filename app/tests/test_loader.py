from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from roadmap import load_repository


DIRECTORIES = ("categorias", "capacidades", "nodos", "fuentes", "herramientas", "proyectos")


class RepositoryFixture:
    def __init__(self, root: Path):
        self.root = root
        for directory in DIRECTORIES:
            (root / directory).mkdir()
            (root / directory / "README.md").write_text(f"# {directory}\n", encoding="utf-8")
        self.write("categorias", "base", "# Base\n")
        self.write("capacidades", "capacidad-base", "# Capacidad base\n")
        self.write(
            "fuentes", "fuente-base",
            '---\nformato: documentacion\nplataforma: web\norigen: "https://example.test/a\\\"b"\n'
            'autor: Autor\ncategoria: base\nclasificacion: oro\nmateriales: []\n---\n# Fuente base\n',
        )
        self.write(
            "nodos", "nodo-base",
            "---\nestado: aprendido\nprioridad: alta\nestimacion: corta\ncategoria: base\n"
            "depende_de: []\nfuentes:\n  - fuente-base\n---\n# Nodo base\n",
        )

    def write(self, directory: str, identifier: str, content: str) -> None:
        (self.root / directory / f"{identifier}.md").write_text(content, encoding="utf-8")


class LoaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.fixture = RepositoryFixture(self.root)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_reads_six_types_and_excludes_readmes(self) -> None:
        index = load_repository(self.root)
        self.assertEqual(set(index.entities), {"categoria", "capacidad", "nodo", "fuente", "herramienta", "proyecto"})
        self.assertNotIn("README", index.entities["categoria"])
        self.assertEqual(index.entities["nodo"]["nodo-base"].body, "# Nodo base\n")
        self.assertIn('a"b', index.entities["fuente"]["fuente-base"].metadata["origen"])

    def test_missing_and_empty_list_are_distinct(self) -> None:
        self.fixture.write(
            "nodos", "lista-vacia",
            "---\nestado: pendiente\nprioridad: baja\nestimacion: corta\ncategoria: base\n"
            "depende_de: []\nfuentes: []\n---\n# Lista vacía\n",
        )
        self.fixture.write(
            "nodos", "lista-ausente",
            "---\nestado: pendiente\nprioridad: baja\nestimacion: corta\ncategoria: base\n"
            "fuentes: []\n---\n# Lista ausente\n",
        )
        index = load_repository(self.root)
        self.assertTrue(index.entities["nodo"]["lista-vacia"].valid)
        self.assertIn("falta el campo obligatorio 'depende_de'", index.entities["nodo"]["lista-ausente"].errors)

    def test_required_fields_and_allowed_node_values_are_validated(self) -> None:
        self.fixture.write(
            "nodos", "valores-invalidos",
            "---\nestado: nuevo\nprioridad: urgente\nestimacion: enorme\ncategoria: base\n"
            "depende_de: []\n---\n# Valores inválidos\n",
        )
        errors = load_repository(self.root).entities["nodo"]["valores-invalidos"].errors
        self.assertIn("falta el campo obligatorio 'fuentes'", errors)
        self.assertTrue(any("'estado'" in error for error in errors))
        self.assertTrue(any("'prioridad'" in error for error in errors))
        self.assertTrue(any("'estimacion'" in error for error in errors))

    def test_invalid_yaml_and_missing_h1_remain_visible(self) -> None:
        self.fixture.write("nodos", "yaml-roto", "---\n[\n---\ntexto\n")
        entity = load_repository(self.root).entities["nodo"]["yaml-roto"]
        self.assertFalse(entity.valid)
        self.assertEqual(entity.path, "nodos/yaml-roto.md")
        self.assertTrue(any("YAML inválido" in error for error in entity.errors))
        self.assertIn("falta un título H1", entity.errors)

    def test_validates_source_quotes_and_values(self) -> None:
        self.fixture.write(
            "fuentes", "fuente-invalida",
            "---\nformato: audio\nplataforma: You Tube\norigen: sin-comillas\nautor: A\n"
            "categoria: inexistente\nclasificacion: bronce\nmateriales:\n  - sin-comillas\n---\n# F\n",
        )
        errors = load_repository(self.root).entities["fuente"]["fuente-invalida"].errors
        self.assertTrue(any("'formato'" in error for error in errors))
        self.assertTrue(any("'plataforma'" in error for error in errors))
        self.assertTrue(any("'origen' debe escribirse" in error for error in errors))
        self.assertTrue(any("materiales[0]" in error for error in errors))
        self.assertTrue(any("categoria inexistente" in error for error in errors))

    def test_validates_project_union_and_preserves_absence(self) -> None:
        self.fixture.write("proyectos", "pausado", "---\nestado: pausado\nprioridad: media\n---\n# Pausado\n")
        self.fixture.write("proyectos", "terminado", "---\nestado: terminado\nprioridad: alta\n---\n# Terminado\n")
        self.fixture.write(
            "proyectos", "activo-incompleto",
            '---\nestado: activo\nprioridad: alta\nproxima_accion: "Hacer"\n---\n# Activo\n',
        )
        index = load_repository(self.root)
        self.assertTrue(index.entities["proyecto"]["pausado"].valid)
        self.assertTrue(any("no admite 'prioridad'" in e for e in index.entities["proyecto"]["terminado"].errors))
        self.assertTrue(any("bloque completo" in e for e in index.entities["proyecto"]["activo-incompleto"].errors))

    def test_direct_inverse_and_derived_relations(self) -> None:
        self.fixture.write(
            "nodos", "nodo-pendiente",
            "---\nestado: pendiente\nprioridad: media\nestimacion: media\ncategoria: base\n"
            "depende_de:\n  - nodo-base\nfuentes:\n  - fuente-base\n---\n# Pendiente\n",
        )
        self.fixture.write(
            "herramientas", "tool",
            '---\ntipo: servicio\ncapacidades:\n  capacidad-base: oro\norigen: "https://tool.test"\n'
            "fuentes:\n  - fuente-base\n---\n# Tool\n",
        )
        self.fixture.write(
            "proyectos", "proyecto",
            '---\nestado: activo\nprioridad: alta\nproxima_accion: "Hacer"\n'
            "duracion_proxima_accion: corta\nnodos_requeridos:\n  - nodo-base\n"
            "capacidades_requeridas:\n  - capacidad-base\n---\n# Proyecto\n",
        )
        index = load_repository(self.root)
        self.assertEqual(
            index.direct_relations[("nodo", "nodo-pendiente")],
            {"categoria": "base", "fuentes": ["fuente-base"], "depende_de": ["nodo-base"]},
        )
        self.assertEqual(
            index.direct_relations[("herramienta", "tool")]["capacidades"],
            {"capacidad-base": "oro"},
        )
        self.assertEqual(index.node_dependents["nodo-base"], ["nodo-pendiente"])
        self.assertEqual(index.node_projects["nodo-base"], ["proyecto"])
        self.assertEqual(index.source_nodes["fuente-base"], ["nodo-base", "nodo-pendiente"])
        self.assertEqual(index.source_tools["fuente-base"], ["tool"])
        self.assertEqual(
            index.category_references["base"],
            [("fuente", "fuente-base"), ("nodo", "nodo-base"), ("nodo", "nodo-pendiente")],
        )
        self.assertEqual(index.capability_tools["capacidad-base"], [("tool", "oro")])
        self.assertTrue(index.node_available["nodo-pendiente"])
        self.assertTrue(index.project_ready["proyecto"])
        self.assertEqual(index.node_counts_by_category["base"], 2)
        self.assertEqual(index.dependency_cycles, [])

    def test_capability_tools_are_ordered_by_classification(self) -> None:
        for identifier, classification in (("silver", "plata"), ("gold", "oro"), ("pending", "pendiente")):
            self.fixture.write(
                "herramientas", identifier,
                f'---\ntipo: app\ncapacidades:\n  capacidad-base: {classification}\norigen: "local"\n---\n# {identifier}\n',
            )
        values = load_repository(self.root).capability_tools["capacidad-base"]
        self.assertEqual(values, [("gold", "oro"), ("silver", "plata"), ("pending", "pendiente")])

    def test_broken_references_do_not_crash(self) -> None:
        self.fixture.write(
            "nodos", "referencias-rotas",
            "---\nestado: pendiente\nprioridad: alta\nestimacion: larga\ncategoria: no-existe\n"
            "depende_de:\n  - no-existe\nfuentes:\n  - no-existe\n---\n# Roto\n",
        )
        entity = load_repository(self.root).entities["nodo"]["referencias-rotas"]
        self.assertGreaterEqual(len(entity.errors), 3)
        self.assertFalse(entity.valid)
        self.fixture.write(
            "herramientas", "capacidad-rota",
            '---\ntipo: app\ncapacidades:\n  no-existe: oro\norigen: "local"\n---\n# Capacidad rota\n',
        )
        tool = load_repository(self.root).entities["herramienta"]["capacidad-rota"]
        self.assertTrue(any("capacidad inexistente" in error for error in tool.errors))

    def test_cycles_are_detected_and_mark_entities_invalid(self) -> None:
        for identifier, dependency in (("ciclo-a", "ciclo-b"), ("ciclo-b", "ciclo-a")):
            self.fixture.write(
                "nodos", identifier,
                f"---\nestado: pendiente\nprioridad: baja\nestimacion: corta\ncategoria: base\n"
                f"depende_de:\n  - {dependency}\nfuentes: []\n---\n# {identifier}\n",
            )
        index = load_repository(self.root)
        self.assertEqual(index.dependency_cycles, [("ciclo-a", "ciclo-b")])
        self.assertFalse(index.entities["nodo"]["ciclo-a"].valid)
        self.assertEqual(index.node_blockers["ciclo-a"], ["ciclo-a", "ciclo-b"])

    def test_repository_root_is_derived_from_module_location(self) -> None:
        index = load_repository()
        self.assertIn("reglas-permanentes-y-tareas-puntuales", index.entities["nodo"])
        self.assertNotIn("README", index.entities["nodo"])

    def test_app_is_excluded_paths_are_relative_and_loading_does_not_write(self) -> None:
        app = self.root / "app"
        app.mkdir()
        (app / "entidad-falsa.md").write_text("# No es entidad\n", encoding="utf-8")
        before = {
            path.relative_to(self.root).as_posix(): path.read_bytes()
            for directory in DIRECTORIES
            for path in (self.root / directory).glob("*.md")
        }
        index = load_repository(self.root)
        after = {
            path.relative_to(self.root).as_posix(): path.read_bytes()
            for directory in DIRECTORIES
            for path in (self.root / directory).glob("*.md")
        }
        self.assertEqual(before, after)
        self.assertFalse(any(entity.identifier == "entidad-falsa" for entity in index.all_entities()))
        self.assertTrue(all(not Path(entity.path).is_absolute() for entity in index.all_entities()))

    def test_invalid_reference_item_types_are_reported(self) -> None:
        self.fixture.write(
            "nodos", "tipos-invalidos",
            "---\nestado: pendiente\nprioridad: media\nestimacion: corta\ncategoria: base\n"
            "depende_de:\n  - 42\nfuentes: []\n---\n# Tipos inválidos\n",
        )
        errors = load_repository(self.root).entities["nodo"]["tipos-invalidos"].errors
        self.assertTrue(any("depende_de[0]" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
