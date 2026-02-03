from app import db


class Department(db.Model):
    """
    多层级部门表（department）
    """
    __tablename__ = 'department'

    departmentID = db.Column(db.Integer, primary_key=True)
    parentID = db.Column(db.Integer, nullable=True)
    department_name = db.Column(db.String(255), nullable=False)
    department_leaderID = db.Column(db.Integer, nullable=True)

    @staticmethod
    def build_id_map():
        """{department_id: Department}"""
        return {d.departmentID: d for d in Department.query.all()}

    @staticmethod
    def build_children_map(dept_map):
        """{parent_id: [child_id, ...]}"""
        children_map = {}
        for d in dept_map.values():
            children_map.setdefault(d.parentID, []).append(d.departmentID)
        return children_map

    @staticmethod
    def build_chain(department_id, dept_map=None, max_depth=64):
        """
        返回从最高级到当前的 Department 链（root -> leaf）
        """
        if not department_id:
            return []
        dept_map = dept_map or Department.build_id_map()
        cur = int(department_id)
        seen = set()
        chain = []
        depth = 0
        while cur and depth < max_depth:
            if cur in seen:
                break
            seen.add(cur)
            d = dept_map.get(cur)
            if not d:
                break
            chain.append(d)
            cur = d.parentID
            depth += 1
        chain.reverse()
        return chain

    @staticmethod
    def build_path(department_id, dept_map=None, sep='/'):
        """
        返回 (链式部门字符串, 链节点列表)：
        - path: 如 气象台/气象设备室
        - chain: [{department_id,parent_id,department_name}, ...] (root -> leaf)
        """
        if not department_id:
            return '', []

        dept_map = dept_map or Department.build_id_map()
        chain_models = Department.build_chain(department_id, dept_map=dept_map)
        names = [d.department_name for d in chain_models if d and d.department_name]
        path = sep.join(names)
        chain = [
            {
                'department_id': d.departmentID,
                'parent_id': d.parentID,
                'department_name': d.department_name,
            }
            for d in chain_models
        ]
        return path, chain
