# Lector del roadmap

Lector de solo lectura para los seis tipos de entidad del repositorio. Separa el
frontmatter de forma controlada, delega toda la semántica YAML a PyYAML y
construye en memoria validaciones, relaciones directas e inversas e información
derivada. No depende de Flask ni escribe en las carpetas de entidades.

Los `README.md` de cada carpeta son índices de navegación y no se tratan como
entidades.

## Pruebas

Desde la raíz del repositorio, con las dependencias instaladas:

```powershell
python -m unittest discover -s app/tests -v
```
