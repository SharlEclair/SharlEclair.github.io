import bpy, math
from mathutils import Matrix, Vector

OUT = r"C:\Users\91704\Desktop\portfolio-website-claude\prototypes\public\models\gameboy.glb"
R = Matrix.Rotation(math.pi / 2, 4, 'X')   # three coords (x, y up, z front) -> blender (x, -z, y): exporter maps back
# the page drives the procedural cartridge (labels, insert path), so the glb leaves the cart_* meshes out
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.startswith('cart')]
for o in objs:
    o.location = R @ o.location
    o.data.transform(R)
    o.data.update()
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
try:
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_materials='EXPORT', export_cameras=False, export_lights=False)
finally:
    pass
# undo the rotation so the scene stays in three coords for further edits
Ri = R.inverted()
for o in objs:
    o.location = Ri @ o.location
    o.data.transform(Ri)
    o.data.update()
import os
print(OUT, os.path.getsize(OUT))
